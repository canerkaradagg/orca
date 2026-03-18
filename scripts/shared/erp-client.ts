/**
 * Ortak ERP client modülü – db-api-handler ve test-onayla-step1 tarafından kullanılır.
 */

import logger from '../lib/logger'
import http from 'http'
import https from 'https'
import { getPool } from '../db/connection-pool'
import sql from 'mssql'

function getErpBase(): string {
  const url = process.env.ERP_INTEGRATOR_URL
  if (!url) {
    logger.warn('ERP_INTEGRATOR_URL tanımlı değil – .env dosyasını kontrol edin.')
    return ''
  }
  return url.replace(/\/$/, '')
}

function getErpConnectBody(): string {
  return JSON.stringify({
    ModelType: 1,
    DatabaseName: process.env.ERP_INTEGRATOR_DATABASE || 'OLKAV3',
    UserGroupCode: process.env.ERP_INTEGRATOR_USER_GROUP || 'OFIS',
    UserName: process.env.ERP_INTEGRATOR_USER || 'Integrator',
    Password: process.env.ERP_INTEGRATOR_PASSWORD ?? '',
    Validate: true,
  })
}

const ERP_TOKEN_CACHE: { token: string | null; expiresAt: number } = { token: null, expiresAt: 0 }
const ERP_TOKEN_TTL_MS = 55 * 60 * 1000

function erpPost(pathSuffix: string, body: string, timeoutMs = 60000): Promise<string> {
  const requestPromise = new Promise<string>((resolve, reject) => {
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
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString()
        if (res.statusCode && res.statusCode >= 400) {
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
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('ERP istek zaman aşımı')), timeoutMs + 5000)
  )
  return Promise.race([requestPromise, timeoutPromise])
}

export async function getErpToken(): Promise<string> {
  const now = Date.now()
  if (ERP_TOKEN_CACHE.token && ERP_TOKEN_CACHE.expiresAt > now) {
    return ERP_TOKEN_CACHE.token
  }
  const data = await erpPost('/IntegratorService/connect', getErpConnectBody())
  const json = JSON.parse(data) as { Token?: string }
  const token = json.Token
  if (!token) throw new Error('ERP Connect: Token alınamadı')
  ERP_TOKEN_CACHE.token = token
  ERP_TOKEN_CACHE.expiresAt = now + ERP_TOKEN_TTL_MS
  return token
}

export async function getVendorOrdersFromAllocation(
  company: string,
  vendorCode: string,
  poNumber: string,
  warehouseCode: string,
  importFileNumber = ''
): Promise<Record<string, unknown>[]> {
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
  return rows.map((r: Record<string, unknown>) => ({ ...r, _poNumber: poNumber, ITAtt01: r.ITAtt01 ?? poNumber }))
}

export function getRunProcQty1(row: Record<string, unknown>): number {
  const raw = row.Qty1 != null ? row.Qty1 : row.qty1
  if (raw == null) return 0
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const n = parseInt(String(raw), 10)
  return Number.isNaN(n) ? 0 : n
}

export function getRowQuantity(r: Record<string, unknown>): number {
  const raw = r.quantity != null ? r.quantity : r.Quantity
  if (raw == null) return 0
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const n = parseInt(String(raw), 10)
  return Number.isNaN(n) ? 0 : n
}

export function checkRunProcSufficiency(
  runProcRows: Record<string, unknown>[],
  rows: Record<string, unknown>[],
  reservedByDrafts?: Record<string, number>
): string[] {
  const reserved = reservedByDrafts || {}
  const key = (b: string, po: string | null) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const getPo = (r: Record<string, unknown>) =>
    (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : (r['PO Number'] != null ? String(r['PO Number']) : '')).trim()
  const getBarcode = (r: Record<string, unknown>) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
  const needed: Record<string, number> = {}
  for (const r of rows) {
    const b = getBarcode(r)
    if (!b) continue
    const po = getPo(r)
    const k = key(b, po)
    const q = getRowQuantity(r)
    needed[k] = (needed[k] || 0) + q
  }
  const available: Record<string, number> = {}
  for (const row of runProcRows) {
    const b = (row._barcode ?? (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '')).toString().trim()
    if (!b) continue
    const po = (row._poNumber ?? (row.ITAtt01 != null ? String(row.ITAtt01) : '')).toString().trim()
    const k = key(b, po)
    const q = getRunProcQty1(row)
    available[k] = (available[k] || 0) + q
  }
  const insufficientBarcodes: string[] = []
  const seen = new Set<string>()
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

export function getInsufficientBarcodesDetail(
  runProcRows: Record<string, unknown>[],
  rows: Record<string, unknown>[],
  reservedByDrafts?: Record<string, number>,
  draftBreakdown?: Record<string, { inboundId: number; quantity: number }[]>
): Array<{ eanBarcode: string; poNumber: string; openOrderQty: number; loadedQty: number; missingQty: number; erpOrders: { orderNumber: string; quantity: number }[]; draftReservations: { inboundId: number; quantity: number }[] }> {
  const reserved = reservedByDrafts || {}
  const breakdown = draftBreakdown || {}
  const key = (b: string, po: string | null) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const getPo = (r: Record<string, unknown>) =>
    (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : (r['PO Number'] != null ? String(r['PO Number']) : '')).trim()
  const getBarcode = (r: Record<string, unknown>) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
  const getErpPo = (row: Record<string, unknown>) => (row._poNumber ?? (row.ITAtt01 != null ? String(row.ITAtt01) : '')).toString().trim()
  const getErpBarcode = (row: Record<string, unknown>) => (row._barcode ?? (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '')).toString().trim()
  const needed: Record<string, number> = {}
  for (const r of rows) {
    const b = getBarcode(r)
    if (!b) continue
    const po = getPo(r)
    const k = key(b, po)
    const q = getRowQuantity(r)
    needed[k] = (needed[k] || 0) + q
  }
  const available: Record<string, number> = {}
  for (const row of runProcRows) {
    const b = getErpBarcode(row)
    if (!b) continue
    const po = getErpPo(row)
    const k = key(b, po)
    const q = getRunProcQty1(row)
    available[k] = (available[k] || 0) + q
  }
  const detail: Array<{ eanBarcode: string; poNumber: string; openOrderQty: number; loadedQty: number; missingQty: number; erpOrders: { orderNumber: string; quantity: number }[]; draftReservations: { inboundId: number; quantity: number }[] }> = []
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

export function formatOrderAsnDate(value: unknown): string {
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

export function buildPostBodyModel95(
  runProcRows: Record<string, unknown>[],
  rows: Record<string, unknown>[],
  processCode: string,
  warehouseCode: string
): Record<string, unknown> {
  if (runProcRows.length === 0) throw new Error('RunProc cevabı boş')
  const first = runProcRows[0]
  let modelTypeFromProcess: number | null = null
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
  const header: Record<string, unknown> = {
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
  const byBarcode: Record<string, Array<{ orderlineId: string; qty1: number }>> = {}
  for (const row of runProcRows) {
    const b = (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '').trim()
    if (!b) continue
    if (!byBarcode[b]) byBarcode[b] = []
    const orderlineId = row.OrderlineID != null ? String(row.OrderlineID) : row.OrderLineId != null ? String(row.OrderLineId) : ''
    const qty1 = getRunProcQty1(row)
    byBarcode[b].push({ orderlineId, qty1 })
  }
  const lines: Array<{ OrderLineId: string; Qty1: number; PickingNumber: string }> = []
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

export async function runProc(token: string, body: Record<string, unknown> | string): Promise<Record<string, unknown>[]> {
  const data = await erpPost(
    '/IntegratorService/RunProc/' + encodeURIComponent(token),
    typeof body === 'string' ? body : JSON.stringify(body)
  )
  const parsed = JSON.parse(data) as Record<string, unknown> | Record<string, unknown>[]
  if (Array.isArray(parsed)) return parsed
  const p = parsed as Record<string, unknown>
  if (p && Array.isArray(p.rows)) return p.rows
  if (p && Number(p.StatusCode) >= 400) throw new Error(String(p.Status || p.Message || data))
  throw new Error('RunProc beklenmeyen cevap: ' + data)
}

export async function postAsn(token: string, body: Record<string, unknown> | string): Promise<string> {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const data = await erpPost(
    '/IntegratorService/Post/' + encodeURIComponent(token),
    bodyStr
  )
  const json = JSON.parse(data) as Record<string, unknown>
  if (json.StatusCode != null && parseInt(String(json.StatusCode), 10) >= 400) {
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
    throw new Error('ERP Post: ' + String(json.error))
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

export { erpPost }
