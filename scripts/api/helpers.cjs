/**
 * ORCA – Shared API helpers (extracted from db-api-handler.cjs)
 */

const { getPool } = require('../db/connection-pool.cjs')
const sql  = require('mssql')
const fs   = require('fs')
const path = require('path')
const crypto = require('crypto')

// ── File upload ─────────────────────────────────────
function saveUploadedFile(fileContentBase64, fileName, inboundId) {
  if (!fileContentBase64 || !fileName || !inboundId) return null
  try {
    const dir  = path.join(process.cwd(), 'UploadedASNFiles')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const safe = fileName.replace(/[<>:"/\\|?*]/g, '_')
    const dest = path.join(dir, `${inboundId}_${safe}`)
    fs.writeFileSync(dest, Buffer.from(fileContentBase64, 'base64'))
    return dest
  } catch (err) {
    console.error('[helpers] UploadedASNFiles kayıt hatası:', err.message)
    return null
  }
}

// ── ItemBarcode cache ───────────────────────────────
const ITEM_BARCODE_CACHE_TTL_MS = 2 * 60 * 1000
const itemBarcodeCache = new Map()

function barcodesCacheKey(company, barcodes) {
  const sorted = [...new Set(barcodes)].filter(Boolean).sort()
  if (sorted.length === 0) return null
  const raw = `${company}:${sorted.join(',')}`
  const hash = raw.length > 500 ? crypto.createHash('sha256').update(raw).digest('hex') : raw
  return `ib:${company}:${hash}`
}

async function getCachedItemBarcodeBatch(pool, company, barcodes) {
  const key = barcodesCacheKey(company, barcodes)
  if (!key) return []
  const now = Date.now()
  const entry = itemBarcodeCache.get(key)
  if (entry && (now - entry.ts) < ITEM_BARCODE_CACHE_TTL_MS) return entry.rows
  const sorted = [...new Set(barcodes)].filter(Boolean).sort()
  const placeholders = sorted.map(() => '?').join(',')
  const stmt = pool.getPreparedStatement(
    `SELECT Barcode, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code FROM ext.ItemBarcode WHERE BarcodeTypeCode = 'EAN13' AND Company = ? AND Barcode IN (${placeholders})`,
    'read'
  )
  const rows = await stmt.all(company, ...sorted)
  const list = rows || []
  itemBarcodeCache.set(key, { rows: list, ts: now })
  return list
}

// ── Distributed lock ────────────────────────────────
const taslakLocks = new Map()
const LOCK_TIMEOUT_MS = 5000

async function withLock(companyCode, vendorCode, fn) {
  const key  = `${companyCode || ''}|${vendorCode || ''}`
  const prev = taslakLocks.get(key) || Promise.resolve()
  const next = prev.then(async () => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req = sqlPool.request()
    const resource = `Taslak|${companyCode || ''}|${vendorCode || ''}`
    req.input('Resource', sql.NVarChar(255), resource)
    const r = await req.query(
      `DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @Resource, @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = ${LOCK_TIMEOUT_MS}; SELECT @r AS LockResult;`
    )
    const lockResult = r.recordset?.[0]?.LockResult
    if (lockResult == null || lockResult < 0) {
      throw new Error('Taslak/ASN kilit alınamadı (meşgul veya zaman aşımı).')
    }
    try {
      return await fn()
    } finally {
      const releaseReq = sqlPool.request()
      releaseReq.input('Resource', sql.NVarChar(255), resource)
      await releaseReq.query("EXEC sp_releaseapplock @Resource = @Resource, @LockOwner = N'Session'")
    }
  }, err => { throw err })
  taslakLocks.set(key, next)
  try {
    return await next
  } finally {
    if (taslakLocks.get(key) === next) taslakLocks.delete(key)
  }
}

// ── Reserved drafts ─────────────────────────────────
async function getReservedByDrafts(pool, companyCode, vendorCode, excludeInboundId) {
  const stmt = pool.getPreparedStatement(
    `SELECT il.PONumber, il.Barcode, SUM(il.Quantity) AS reservedQty
     FROM dbo.Inbound i
     INNER JOIN dbo.InboundLine il ON i.InboundId = il.InboundId
     WHERE i.Status = 'Taslak'
       AND i.CompanyCode = ?
       AND i.VendorCode = ?
       AND il.Barcode IS NOT NULL AND il.Barcode <> ''
       AND (? IS NULL OR i.InboundId != ?)
     GROUP BY il.PONumber, il.Barcode`, 'read')
  const rows = await stmt.all(companyCode || '', vendorCode || '', excludeInboundId, excludeInboundId)
  const key = (b, po) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const reserved = {}
  for (const r of rows || []) {
    const b  = (r.Barcode  != null ? String(r.Barcode)  : '').trim()
    const po = (r.PONumber != null ? String(r.PONumber) : '').trim()
    const q  = r.reservedQty != null ? (typeof r.reservedQty === 'number' ? r.reservedQty : parseInt(String(r.reservedQty), 10) || 0) : 0
    reserved[key(b, po)] = (reserved[key(b, po)] || 0) + q
  }
  return reserved
}

async function getReservedBreakdown(pool, companyCode, vendorCode, excludeInboundId) {
  const stmt = pool.getPreparedStatement(
    `SELECT i.InboundId, il.PONumber, il.Barcode, il.Quantity
     FROM dbo.Inbound i
     INNER JOIN dbo.InboundLine il ON i.InboundId = il.InboundId
     WHERE i.Status = 'Taslak'
       AND i.CompanyCode = ?
       AND i.VendorCode = ?
       AND il.Barcode IS NOT NULL AND il.Barcode <> ''
       AND (? IS NULL OR i.InboundId != ?)`, 'read')
  const rows = await stmt.all(companyCode || '', vendorCode || '', excludeInboundId, excludeInboundId)
  const key  = (b, po) => (b || '') + '|' + (po != null ? String(po).trim() : '')
  const bd   = {}
  for (const r of rows || []) {
    const b  = (r.Barcode  != null ? String(r.Barcode)  : '').trim()
    const po = (r.PONumber != null ? String(r.PONumber) : '').trim()
    const k  = key(b, po)
    const id = r.InboundId != null ? (typeof r.InboundId === 'number' ? r.InboundId : parseInt(String(r.InboundId), 10)) : 0
    const q  = r.Quantity  != null ? (typeof r.Quantity  === 'number' ? r.Quantity  : parseInt(String(r.Quantity),  10) || 0) : 0
    if (!bd[k]) bd[k] = []
    bd[k].push({ inboundId: id, quantity: q })
  }
  return bd
}

// ── Company key resolver ────────────────────────────
async function resolveCompanyKey(pool, companyParam) {
  if (!companyParam) return null
  try {
    const stmt = pool.getPreparedStatement(
      `SELECT CompanyCode, Company, CompanyId FROM dbo.cdCompany WHERE LTRIM(RTRIM(CAST(CompanyCode AS NVARCHAR(100)))) = LTRIM(RTRIM(?))`, 'read')
    const row = await stmt.get(companyParam)
    if (row) {
      const key = row.Company ?? row.CompanyId ?? row.company ?? row.companyId
      if (key != null && key !== '') return key
    }
  } catch {}
  return companyParam
}

// ── Inbound INSERT ──────────────────────────────────
async function insertInbound(data) {
  const { companyCode, warehouseCode, fileName, uploadPath, createdUserId, vendorCode, channelTemplateCode, importFileNumber, rows = [] } = data
  if (!companyCode || !warehouseCode || !fileName) throw new Error('companyCode, warehouseCode ve fileName gerekli.')
  const pool = getPool()
  const insInbound = pool.getPreparedStatement(
    `INSERT INTO dbo.Inbound (CompanyCode, WarehouseCode, FileName, UploadPath, CreatedUserId, Status, InProgress, VendorCode, ChannelTemplateCode, ImportFileNumber)
     VALUES (?, ?, ?, ?, ?, 'Taslak', 0, ?, ?, ?)`, 'write')
  const r = await insInbound.run(companyCode, warehouseCode, fileName, uploadPath || null, createdUserId ?? null, vendorCode || null, channelTemplateCode || null, importFileNumber || null)
  const inboundId = r.lastInsertRowid
  if (rows.length > 0) {
    const valuesSql = rows.map(() => '(?, ?, ?, ?, ?)').join(',')
    const insLine = pool.getPreparedStatement(
      `INSERT INTO dbo.InboundLine (InboundId, PackageNumber, PONumber, Barcode, Quantity) VALUES ${valuesSql}`,
      'write'
    )
    const params = []
    for (const row of rows) {
      const pkg = (row.packageNumber ?? row.PackageNumber ?? null) != null ? String(row.packageNumber ?? row.PackageNumber) : null
      const po  = (row.poNumber ?? row.poNo ?? row.PONumber ?? row['PO Number'] ?? null) != null ? String(row.poNumber ?? row.poNo ?? row.PONumber ?? row['PO Number']) : null
      const ean = row.barcode != null ? String(row.barcode) : null
      const qty = row.quantity != null ? (typeof row.quantity === 'number' ? row.quantity : parseInt(String(row.quantity), 10) || 0) : null
      params.push(inboundId, pkg, po, ean, qty)
    }
    await insLine.run(...params)
  }
  return { inboundId, lineCount: rows.length }
}

// ── Draft update from Queue success ─────────────────
async function updateDraftFromQueueSuccess(sqlPool, row, responseText) {
  if (!row || row.SourceTypeId == null || row.SourceId == null || !responseText) return
  const draftHeaderId = row.SourceId
  let parsed
  try { parsed = JSON.parse(responseText) } catch { return }
  if (!parsed || typeof parsed !== 'object') return
  const data = parsed.Result != null || parsed.Data != null || parsed.Response != null || parsed.Value != null
    ? (parsed.Result ?? parsed.Data ?? parsed.Response ?? parsed.Value)
    : parsed
  const payload = data && typeof data === 'object' ? data : parsed
  const lines = Array.isArray(payload?.Lines) ? payload.Lines : Array.isArray(payload?.lines) ? payload.lines : null
  const toGuid = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)

  if (row.SourceTypeId === 4) {
    const orderHeaderId = toGuid(payload?.HeaderID ?? payload?.HeaderId ?? payload?.OrderHeaderId ?? payload?.orderHeaderId)
    await sqlPool.request()
      .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
      .input('OrderHeaderId', sql.UniqueIdentifier, orderHeaderId)
      .query(`UPDATE dbo.DraftOrderHeader SET OrderHeaderId = ISNULL(@OrderHeaderId, OrderHeaderId), IsOrdered = 1 WHERE DraftOrderHeaderId = @DraftOrderHeaderId`)
    if (lines && lines.length > 0) {
      for (const line of lines) {
        const lineId = toGuid(line?.LineID ?? line?.LineId ?? line?.OrderLineId)
        if (!lineId) continue
        const d1 = line?.ItemDim1Code ?? line?.ItemDim1 ?? null
        const d2 = line?.ItemDim2Code ?? line?.ItemDim2 ?? null
        await sqlPool.request()
          .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
          .input('OrderLineId', sql.UniqueIdentifier, lineId)
          .input('ItemDim1Code', sql.NVarChar(10), d1)
          .input('ItemDim2Code', sql.NVarChar(10), d2)
          .query(`UPDATE dbo.DraftOrderLine SET OrderLineId = @OrderLineId
                  WHERE DraftOrderHeaderId = @DraftOrderHeaderId
                    AND ISNULL(ItemDim1Code,'') = ISNULL(@ItemDim1Code,'')
                    AND ISNULL(ItemDim2Code,'') = ISNULL(@ItemDim2Code,'')`)
      }
    }
    return
  }

  if (row.SourceTypeId === 5) {
    const reserveHeaderId = toGuid(payload?.reserveHeaderId ?? payload?.ReserveHeaderId ?? payload?.ReserveHeaderID ?? payload?.HeaderID ?? payload?.HeaderId)
    await sqlPool.request()
      .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
      .input('ReserveHeaderId', sql.UniqueIdentifier, reserveHeaderId)
      .query(`UPDATE dbo.DraftOrderHeader SET ReserveHeaderId = ISNULL(@ReserveHeaderId, ReserveHeaderId), IsReserved = 1 WHERE DraftOrderHeaderId = @DraftOrderHeaderId`)
    if (lines && lines.length > 0) {
      for (const line of lines) {
        const lineId = toGuid(line?.ReserveLineID ?? line?.ReserveLineId ?? line?.reserveLineID ?? line?.reserveLineId ?? line?.LineID ?? line?.LineId)
        if (!lineId) continue
        const orderLineId = toGuid(line?.OrderLineID ?? line?.OrderLineId)
        const d1 = line?.ItemDim1Code ?? line?.ItemDim1 ?? null
        const d2 = line?.ItemDim2Code ?? line?.ItemDim2 ?? null
        const req = sqlPool.request()
          .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
          .input('ReserveLineId', sql.UniqueIdentifier, lineId)
          .input('ItemDim1Code', sql.NVarChar(10), d1)
          .input('ItemDim2Code', sql.NVarChar(10), d2)
        if (orderLineId) req.input('OrderLineId', sql.UniqueIdentifier, orderLineId)
        await req.query(orderLineId
          ? `UPDATE dbo.DraftOrderLine SET ReserveLineId = @ReserveLineId
             WHERE DraftOrderHeaderId = @DraftOrderHeaderId
               AND ISNULL(ItemDim1Code,'') = ISNULL(@ItemDim1Code,'')
               AND ISNULL(ItemDim2Code,'') = ISNULL(@ItemDim2Code,'')
               AND OrderLineId = @OrderLineId`
          : `UPDATE dbo.DraftOrderLine SET ReserveLineId = @ReserveLineId
             WHERE DraftOrderHeaderId = @DraftOrderHeaderId
               AND ISNULL(ItemDim1Code,'') = ISNULL(@ItemDim1Code,'')
               AND ISNULL(ItemDim2Code,'') = ISNULL(@ItemDim2Code,'')`)
      }
    }
    return
  }

  if (row.SourceTypeId === 6) {
    const dispOrderHeaderId = toGuid(payload?.dispOrderHeaderId ?? payload?.DispOrderHeaderId ?? payload?.DispOrderHeaderID ?? payload?.HeaderID ?? payload?.HeaderId)
    await sqlPool.request()
      .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
      .input('DispOrderHeaderId', sql.UniqueIdentifier, dispOrderHeaderId)
      .query(`UPDATE dbo.DraftOrderHeader SET DispOrderHeaderId = ISNULL(@DispOrderHeaderId, DispOrderHeaderId), IsDispOrdered = 1 WHERE DraftOrderHeaderId = @DraftOrderHeaderId`)
    if (lines && lines.length > 0) {
      for (const line of lines) {
        const lineId = toGuid(line?.DispOrderLineId ?? line?.DispOrderLineID ?? line?.LineID ?? line?.LineId)
        if (!lineId) continue
        const orderLineId = toGuid(line?.OrderLineID ?? line?.OrderLineId)
        const d1 = line?.ItemDim1Code ?? line?.ItemDim1 ?? null
        const d2 = line?.ItemDim2Code ?? line?.ItemDim2 ?? null
        const req = sqlPool.request()
          .input('DraftOrderHeaderId', sql.Int, draftHeaderId)
          .input('DispOrderLineId', sql.UniqueIdentifier, lineId)
          .input('ItemDim1Code', sql.NVarChar(10), d1)
          .input('ItemDim2Code', sql.NVarChar(10), d2)
        if (orderLineId) req.input('OrderLineId', sql.UniqueIdentifier, orderLineId)
        await req.query(orderLineId
          ? `UPDATE dbo.DraftOrderLine SET DispOrderLineId = @DispOrderLineId
             WHERE DraftOrderHeaderId = @DraftOrderHeaderId
               AND ISNULL(ItemDim1Code,'') = ISNULL(@ItemDim1Code,'')
               AND ISNULL(ItemDim2Code,'') = ISNULL(@ItemDim2Code,'')
               AND OrderLineId = @OrderLineId`
          : `UPDATE dbo.DraftOrderLine SET DispOrderLineId = @DispOrderLineId
             WHERE DraftOrderHeaderId = @DraftOrderHeaderId
               AND ISNULL(ItemDim1Code,'') = ISNULL(@ItemDim1Code,'')
               AND ISNULL(ItemDim2Code,'') = ISNULL(@ItemDim2Code,'')`)
      }
    }
    return
  }
}

module.exports = {
  saveUploadedFile,
  getCachedItemBarcodeBatch,
  withLock,
  getReservedByDrafts,
  getReservedBreakdown,
  resolveCompanyKey,
  insertInbound,
  updateDraftFromQueueSuccess,
}
