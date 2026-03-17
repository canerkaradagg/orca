/**
 * Ortak ERP client modülü – db-api-handler ve test-onayla-step1 tarafından kullanılır.
 */

const http = require('http')
const https = require('https')
const { getPool } = require('../db/connection-pool.cjs')
const sql = require('mssql')

// ERP_BASE'i runtime'da oku: dotenv ne zaman yüklenirse yüklensin doğru değeri alsın
function getErpBase() {
  const url = process.env.ERP_INTEGRATOR_URL
  if (!url) {
    console.warn('[erp-client] ERP_INTEGRATOR_URL tanımlı değil – .env dosyasını kontrol edin.')
    return ''
  }
  return url.replace(/\/$/, '')
}

// ERP Connect şifresi env'den; .env'de ERP_INTEGRATOR_PASSWORD tanımlayın
function getErpConnectBody() {
  return JSON.stringify({
    ModelType: 1,
    DatabaseName: process.env.ERP_INTEGRATOR_DATABASE || 'OLKAV3',
    UserGroupCode: process.env.ERP_INTEGRATOR_USER_GROUP || 'OFIS',
    UserName: process.env.ERP_INTEGRATOR_USER || 'Integrator',
    Password: process.env.ERP_INTEGRATOR_PASSWORD ?? '',
    Validate: true,
  })
}

const ERP_TOKEN_CACHE = { token: null, expiresAt: 0 }
const ERP_TOKEN_TTL_MS = 55 * 60 * 1000 // 55 dakika

function erpPost(pathSuffix, body, timeoutMs = 60000) {
  const requestPromise = new Promise((resolve, reject) => {
    const fullUrl = getErpBase() + pathSuffix
    const parsed = new URL(fullUrl)
    const isHttps = parsed.protocol === 'https:'
    const client = isHttps ? https : http
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
    const req = client.request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString()
        if (res.statusCode >= 400) {
          reject(new Error(`ERP ${res.statusCode}: ${data}`))
          return
        }
        resolve(data)
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('ERP istek zaman aşımı'))
    })
    req.end(body)
  })
  // Garantili üst sınır: soket zaman aşımı tetiklenmese bile süreden sonra hata verir
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('ERP istek zaman aşımı')), timeoutMs + 5000)
  )
  return Promise.race([requestPromise, timeoutPromise])
}

async function getErpToken() {
  const now = Date.now()
  if (ERP_TOKEN_CACHE.token && ERP_TOKEN_CACHE.expiresAt > now) {
    return ERP_TOKEN_CACHE.token
  }
  const data = await erpPost('/IntegratorService/connect', getErpConnectBody())
  const json = JSON.parse(data)
  const token = json.Token
  if (!token) throw new Error('ERP Connect: Token alınamadı')
  ERP_TOKEN_CACHE.token = token
  ERP_TOKEN_CACHE.expiresAt = now + ERP_TOKEN_TTL_MS
  return token
}

/**
 * Açık sipariş verisini ext.OrderLine + ext.OrderHeader'dan okur (Union uyumlu; SP yok).
 * CurrAccTypeCode=1, ProcessCode IN ('IP','BP'), OrderTypeCode=3, CompanyCode=1 sabit filtre.
 */
async function getVendorOrdersFromAllocation(company, vendorCode, poNumber, warehouseCode, importFileNumber = '') {
  const pool = await getPool().getPool()
  const req = pool.request()
  req.input('Company', sql.NVarChar(10), (company ?? '').trim())
  req.input('CurrAccCode', sql.NVarChar(30), (vendorCode ?? '').trim())
  req.input('WarehouseCode', sql.NVarChar(10), (warehouseCode ?? '').trim())
  req.input('PoNumber', sql.NVarChar(30), (poNumber ?? '').trim())
  req.input('ImportFileNumber', sql.NVarChar(50), (importFileNumber ?? '').trim())
  const sqlText = `
    SELECT
      ol.OrderLineId   AS OrderlineID,
      COALESCE(ib.Barcode, ol.UsedBarcode) AS UsedBarcode,
      ol.OpenQuantity  AS Qty1,
      oh.OrderNumber   AS OrderNumber,
      ol.PurchaseOrderNo AS ITAtt01,
      oh.CurrAccCode   AS VendorCode,
      ISNULL(pc.ProcessCodeNo, 97) AS ModelType,
      oh.ProcessCode   AS ProcessCode,
      oh.WarehouseCode AS WarehouseCode,
      CAST(NULL AS NVARCHAR(100)) AS Description,
      CAST(NULL AS NVARCHAR(20))  AS OrderAsnDate
    FROM ext.OrderLine ol
    INNER JOIN ext.OrderHeader oh ON oh.OrderHeaderId = ol.OrderHeaderId AND oh.Company = ol.Company
    LEFT JOIN dbo.ProcessCodes pc ON pc.ProcessCodeType = N'OrderASN' AND pc.ProcessCode = LTRIM(RTRIM(ISNULL(oh.ProcessCode,'')))
    LEFT JOIN ext.ItemBarcode ib  ON ib.Company = ol.Company AND ib.ItemCode = ol.ItemCode AND ISNULL(ib.ColorCode,'') = ISNULL(ol.ColorCode,'') AND ISNULL(ib.ItemDim1Code,'') = ISNULL(ol.ItemDim1Code,'')
    WHERE 1=1
      AND ol.Company = @Company
      AND oh.CurrAccTypeCode = 1
      AND oh.CurrAccCode = @CurrAccCode
      AND oh.ProcessCode IN ('IP','BP')
      AND oh.OrderTypeCode = 3
      AND oh.CompanyCode = 1
      AND oh.WarehouseCode = @WarehouseCode
      AND (@PoNumber = '' OR ISNULL(ol.PurchaseOrderNo,'') = @PoNumber)
      AND (@ImportFileNumber = '' OR ISNULL(oh.ImportFileNumber,'') = @ImportFileNumber)
      AND ol.OpenQuantity > 0
  `
  const result = await req.query(sqlText)
  const rows = result.recordset || []
  return rows.map((r) => ({ ...r, _poNumber: poNumber, ITAtt01: r.ITAtt01 ?? poNumber }))
}

function getRunProcQty1(row) {
  const raw = row.Qty1 != null ? row.Qty1 : row.qty1
  if (raw == null) return 0
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const n = parseInt(String(raw), 10)
  return Number.isNaN(n) ? 0 : n
}

function getRowQuantity(r) {
  const raw = r.quantity != null ? r.quantity : r.Quantity
  if (raw == null) return 0
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const n = parseInt(String(raw), 10)
  return Number.isNaN(n) ? 0 : n
}

/** reservedByDrafts: { [barcode|po]: number } - diğer taslakların talep ettiği miktar. Opsiyonel. */
function checkRunProcSufficiency(runProcRows, rows, reservedByDrafts) {
  const reserved = reservedByDrafts || {}
  const key = (b, po) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const getPo = (r) =>
    (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : r['PO Number'] != null ? String(r['PO Number']) : '').trim()
  const getBarcode = (r) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
  const needed = {}
  for (const r of rows) {
    const b = getBarcode(r)
    if (!b) continue
    const po = getPo(r)
    const k = key(b, po)
    const q = getRowQuantity(r)
    needed[k] = (needed[k] || 0) + q
  }
  const available = {}
  for (const row of runProcRows) {
    const b = (row._barcode || (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '')).trim()
    if (!b) continue
    const po = (row._poNumber || (row.ITAtt01 != null ? String(row.ITAtt01) : '')).trim()
    const k = key(b, po)
    const q = getRunProcQty1(row)
    available[k] = (available[k] || 0) + q
  }
  const insufficientBarcodes = []
  const seen = new Set()
  for (const [k, need] of Object.entries(needed)) {
    const avail = available[k] || 0
    const reservedQty = reserved[k] || 0
    const netAvailable = avail - reservedQty
    if (netAvailable < need) {
      const barcode = k.split('|')[0]
      if (!seen.has(barcode)) {
        seen.add(barcode)
        insufficientBarcodes.push(barcode)
      }
    }
  }
  return insufficientBarcodes
}

/** reservedByDrafts: { [barcode|po]: number }. draftBreakdown: { [barcode|po]: [{ inboundId, quantity }] }. openOrderQty = ERP - reserved. */
function getInsufficientBarcodesDetail(runProcRows, rows, reservedByDrafts, draftBreakdown) {
  const reserved = reservedByDrafts || {}
  const breakdown = draftBreakdown || {}
  const key = (b, po) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const getPo = (r) =>
    (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : r['PO Number'] != null ? String(r['PO Number']) : '').trim()
  const getBarcode = (r) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
  const getErpPo = (row) => (row._poNumber || (row.ITAtt01 != null ? String(row.ITAtt01) : '')).trim()
  const getErpBarcode = (row) => (row._barcode || (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '')).trim()
  const needed = {}
  for (const r of rows) {
    const b = getBarcode(r)
    if (!b) continue
    const po = getPo(r)
    const k = key(b, po)
    const q = getRowQuantity(r)
    needed[k] = (needed[k] || 0) + q
  }
  const available = {}
  for (const row of runProcRows) {
    const b = getErpBarcode(row)
    if (!b) continue
    const po = getErpPo(row)
    const k = key(b, po)
    const q = getRunProcQty1(row)
    available[k] = (available[k] || 0) + q
  }
  const detail = []
  for (const [k, need] of Object.entries(needed)) {
    const avail = available[k] || 0
    const reservedQty = reserved[k] || 0
    const netAvailable = avail - reservedQty
    if (netAvailable < need) {
      const [barcode, poNumber] = k.split('|')
      const erpOrders = runProcRows
        .filter((row) => key(getErpBarcode(row), getErpPo(row)) === k)
        .map((row) => ({
          orderNumber: String(row.OrderNumber ?? row.orderNumber ?? ''),
          quantity: getRunProcQty1(row),
        }))
      const draftReservations = breakdown[k] || []
      const draftTotal = draftReservations.reduce((s, d) => s + (d.quantity || 0), 0)
      // Eksik = (Yüklenen + Taslak rezervasyon toplamı) - Net kullanılabilir
      const missingQty = Math.max(0, (need + draftTotal) - netAvailable)
      detail.push({
        eanBarcode: barcode || '',
        poNumber: poNumber || '',
        openOrderQty: netAvailable,
        loadedQty: need,
        missingQty,
        erpOrders,
        draftReservations,
      })
    }
  }
  return detail
}

function formatOrderAsnDate(value) {
  if (value == null || value === '') {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  const s = String(value).trim()
  if (!s) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const parts = s.split(/[-/]/)
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return s
}

function buildPostBodyModel95(runProcRows, rows, processCode, warehouseCode) {
  if (runProcRows.length === 0) throw new Error('RunProc cevabı boş')
  const first = runProcRows[0]
  let modelTypeFromProcess = null
  if (processCode) {
    const pc = String(processCode).trim().toUpperCase()
    if (pc === 'BP') modelTypeFromProcess = 95
    else if (pc === 'IP') modelTypeFromProcess = 97
  }
  const baseModelType =
    first.ModelType != null
      ? typeof first.ModelType === 'number'
        ? first.ModelType
        : parseInt(String(first.ModelType), 10)
      : 97
  const modelType = modelTypeFromProcess != null ? modelTypeFromProcess : baseModelType
  const header = {
    ModelType: Number.isFinite(modelType) ? modelType : 97,
    Description: first.Description != null ? String(first.Description) : '',
    VendorCode: first.VendorCode != null ? String(first.VendorCode) : '',
    IsCompleted: first.IsCompleted != null ? !!first.IsCompleted : true,
    IsConfirmed: first.IsConfirmed != null ? !!first.IsConfirmed : true,
    IsReturn: first.IsReturn != null ? !!first.IsReturn : false,
    LettersOfCreditNumber: first.LettersOfCreditNumber != null ? String(first.LettersOfCreditNumber) : '',
    OfficeCode: first.OfficeCode != null ? String(first.OfficeCode) : 'M',
    OrderAsnDate: formatOrderAsnDate(first.OrderAsnDate),
    WarehouseCode: warehouseCode || (first.WarehouseCode != null ? String(first.WarehouseCode) : ''),
    Lines: [],
  }
  const byBarcode = {}
  for (const row of runProcRows) {
    const b = (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '').trim()
    if (!b) continue
    if (!byBarcode[b]) byBarcode[b] = []
    const orderlineId = row.OrderlineID != null ? String(row.OrderlineID) : row.OrderLineId != null ? String(row.OrderLineId) : ''
    const qty1 = getRunProcQty1(row)
    byBarcode[b].push({ orderlineId, qty1 })
  }
  const lines = []
  const getPo = (r) => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
  for (const r of rows) {
    const barcode = (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
    if (!barcode) continue
    let need = getRowQuantity(r)
    if (need <= 0) continue
    const pickingNumber = r.packageNumber != null ? String(r.packageNumber) : r.PackageNumber != null ? String(r.PackageNumber) : ''
    const pool = byBarcode[barcode] || []
    for (const p of pool) {
      if (need <= 0 || p.qty1 <= 0) continue
      const take = Math.min(need, p.qty1)
      lines.push({
        OrderLineId: p.orderlineId,
        Qty1: take,
        PickingNumber: pickingNumber,
      })
      need -= take
      p.qty1 -= take
    }
  }
  header.Lines = lines
  return header
}

async function runProc(token, body) {
  const data = await erpPost(
    '/IntegratorService/RunProc/' + encodeURIComponent(token),
    typeof body === 'string' ? body : JSON.stringify(body)
  )
  const parsed = JSON.parse(data)
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows
  if (parsed && parsed.StatusCode >= 400) throw new Error(parsed.Status || parsed.Message || data)
  throw new Error('RunProc beklenmeyen cevap: ' + data)
}

async function postAsn(token, body) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const data = await erpPost(
    '/IntegratorService/Post/' + encodeURIComponent(token),
    bodyStr
  )
  const json = JSON.parse(data)
  if (json.StatusCode != null && parseInt(json.StatusCode, 10) >= 400) {
    throw new Error(
      'ERP Post: ' +
        (json.Status ||
          json.Message ||
          json.error ||
          json.Error ||
          json.ExceptionMessage ||
          'Hata ' + json.StatusCode)
    )
  }
  if (json.ok === false && json.error) {
    throw new Error('ERP Post: ' + json.error)
  }
  const asnNo =
    json.OrderAsnNumber ??
    json.orderAsnNumber ??
    json.AsnNo ??
    json.asnNo ??
    json.DocumentNo ??
    json.documentNo
  if (asnNo == null || asnNo === '') {
    const snippet = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(json).slice(0, 300)
    throw new Error('ERP Post: OrderAsnNumber alınamadı. Yanıt: ' + snippet)
  }
  return String(asnNo)
}

module.exports = {
  erpPost,
  getErpToken,
  getVendorOrdersFromAllocation,
  getRunProcQty1,
  getRowQuantity,
  checkRunProcSufficiency,
  getInsufficientBarcodesDetail,
  formatOrderAsnDate,
  buildPostBodyModel95,
  runProc,
  postAsn,
}
