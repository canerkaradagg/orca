const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const http = require('http')
const https = require('https')
const { readBody, getQueryParams, sendJson, sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const {
  saveUploadedFile,
  getCachedItemBarcodeBatch,
  withLock,
  getReservedByDrafts,
  getReservedBreakdown,
  insertInbound,
} = require('../helpers.cjs')
const {
  getVendorOrdersFromAllocation,
  checkRunProcSufficiency,
  getInsufficientBarcodesDetail,
} = require('../../shared/erp-client.cjs')

const ASN_OLUSTUR_CACHE_TTL_MS = 10000
let asnOlusturResponseCache = null
const asnOlusturPending = new Map()

/** ASN referans tablolarını doldurur (InboundAsnCase, InboundAsnLineRef, InboundAsnLineSource). Hata olursa loglar, ana akışı bozmaz. */
async function runAsnRefProcedures(pool, inboundAsnId) {
  if (!inboundAsnId) return
  try {
    const sqlPool = await pool.getPool()
    const r1 = sqlPool.request(); r1.input('InboundAsnId', sql.Int, inboundAsnId); await r1.execute('dbo.FillInboundAsnCase')
    const r2 = sqlPool.request(); r2.input('InboundAsnId', sql.Int, inboundAsnId); await r2.execute('dbo.AllocateInboundAsnLineRef')
    const r3 = sqlPool.request(); r3.input('InboundAsnId', sql.Int, inboundAsnId); await r3.execute('dbo.AllocateInboundAsnLineSource')
  } catch (err) {
    console.error('[inbound] AsnRef procedures error (InboundAsnId=%s):', inboundAsnId, err?.message || err)
  }
}

function register(router) {

  // ── POST /api/erp/connect ───────────────────────────
  router.post('/api/erp/connect', wrapHandler(async (req, res) => {
    const base    = (process.env.ERP_INTEGRATOR_URL || '').replace(/\/$/, '')
    if (!base) return sendError(res, 500, 'ERP_INTEGRATOR_URL is not configured')
    const fullUrl = base + '/IntegratorService/connect'
    let body = ''
    try { body = await readBody(req) } catch (err) { return sendError(res, 400, err.message) }
    const parsed  = new URL(fullUrl)
    const client  = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
    }
    const proxyReq = client.request(options, proxyRes => {
      let chunks = []
      proxyRes.on('data', c => chunks.push(c))
      proxyRes.on('end',  () => {
        res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json' })
        res.end(Buffer.concat(chunks).toString())
      })
    })
    proxyReq.on('error', err => sendError(res, 502, 'ERP bağlantı hatası: ' + (err.message || String(err))))
    proxyReq.end(body)
  }))

  // ── POST /api/taslak-kaydet ─────────────────────────
  router.post('/api/taslak-kaydet', wrapHandler(async (req, res) => {
    const pool = getPool()
    await pool.getPool()
    const data        = JSON.parse(await readBody(req))
    const companyCode = (data.companyCode  || '').toString().trim()
    const warehouseCode = (data.warehouseCode || '').toString().trim()
    const vendorCode  = (data.vendorCode   || '').toString().trim()
    const rows        = Array.isArray(data.rows) ? data.rows : []

    let taslakResult
    try {
      taslakResult = await withLock(companyCode, vendorCode, async () => {
        if (rows.length > 0 && warehouseCode && vendorCode) {
          const getPo = r => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
          let uniquePo = [...new Set(rows.map(r => getPo(r)).filter(Boolean))]
          if (uniquePo.length === 0) uniquePo = ['']
          const importFileNumber = (data.importFileNumber ?? '').toString().trim()
          let runProcRows = []
          try {
            const promises = uniquePo.map(po => getVendorOrdersFromAllocation(companyCode, vendorCode, po, warehouseCode, importFileNumber))
            const results  = await Promise.all(promises)
            for (const chunk of results) {
              if (Array.isArray(chunk) && chunk.length > 0) runProcRows = runProcRows.concat(chunk)
            }
          } catch (err) {
            const e = new Error(err.message || String(err)); e._type = 'erp'; throw e
          }
          const reserved  = await getReservedByDrafts(pool, companyCode, vendorCode, null)
          const breakdown = await getReservedBreakdown(pool, companyCode, vendorCode, null)
          const insuf     = checkRunProcSufficiency(runProcRows, rows, reserved)
          if (insuf.length > 0) {
            const detail = getInsufficientBarcodesDetail(runProcRows, rows, reserved, breakdown)
            const e = new Error('Yeterli açık sipariş olmayan EAN/barcode var.')
            e._type = 'insufficient'; e.insufficientBarcodes = insuf; e.insufficientBarcodesDetail = detail
            throw e
          }
        }
        const uniqueBarcodes = [...new Set(rows.map(r => r.barcode != null ? String(r.barcode).trim() : '').filter(Boolean))]
        if (uniqueBarcodes.length > 0 && companyCode) {
          const rowsExisting = await getCachedItemBarcodeBatch(pool, companyCode, uniqueBarcodes)
          const existing = new Set(rowsExisting.map(r => (r.Barcode != null ? String(r.Barcode).trim() : '')))
          const undefinedEan = uniqueBarcodes.filter(b => !existing.has(b))
          if (undefinedEan.length > 0) {
            const e = new Error('Tanımsız EAN kodları var.')
            e._type = 'undefinedEan'; e.undefinedEanCodes = undefinedEan
            throw e
          }
        }
        return await insertInbound(data)
      })
    } catch (lockErr) {
      if (lockErr?._type === 'erp') return sendError(res, 502, lockErr.message)
      if (lockErr?._type === 'insufficient') return sendJson(res, 200, { ok: false, error: lockErr.message, insufficientBarcodes: lockErr.insufficientBarcodes, insufficientBarcodesDetail: lockErr.insufficientBarcodesDetail })
      if (lockErr?._type === 'undefinedEan') return sendJson(res, 200, { ok: false, error: lockErr.message, undefinedEanCodes: lockErr.undefinedEanCodes })
      throw lockErr
    }

    if (data.fileContent && data.fileName && taslakResult.inboundId) {
      const uploadPath = saveUploadedFile(data.fileContent, data.fileName, taslakResult.inboundId)
      if (uploadPath) {
        const upd = pool.getPreparedStatement('UPDATE dbo.Inbound SET UploadPath = ? WHERE InboundId = ?', 'write')
        await upd.run(uploadPath, taslakResult.inboundId)
      }
    }
    sendOk(res, { inboundId: taslakResult.inboundId, lineCount: taslakResult.lineCount })
  }))

  // ── POST /api/asn-olustur-erp ───────────────────────
  router.post('/api/asn-olustur-erp', async (req, res) => {
    const pool = getPool()
    try { await pool.getPool() } catch (err) { return sendError(res, 500, `DB bağlantı hatası: ${err.message}`) }
    let cacheKey, resolvePending
    try {
      const data          = JSON.parse(await readBody(req))
      const companyCode   = (data.companyCode    || '').toString().trim()
      const warehouseCode = (data.warehouseCode  || '').toString().trim()
      const vendorCode    = (data.vendorCode     || '').toString().trim()
      const rows          = Array.isArray(data.rows) ? data.rows : []
      if (!companyCode || !warehouseCode || !data.fileName || !vendorCode) return sendError(res, 400, 'companyCode, warehouseCode, fileName ve vendorCode gerekli.')

      cacheKey = data.idempotencyKey || `asn:${companyCode}:${vendorCode}:${(data.fileName || '').toString().trim()}`
      if (!asnOlusturResponseCache) asnOlusturResponseCache = new Map()
      const now = Date.now()
      for (const [k, v] of asnOlusturResponseCache.entries()) {
        if (now - v.ts > ASN_OLUSTUR_CACHE_TTL_MS) asnOlusturResponseCache.delete(k)
      }
      const cached = asnOlusturResponseCache.get(cacheKey)
      if (cached && (now - cached.ts) < ASN_OLUSTUR_CACHE_TTL_MS) {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(cached.body); return
      }
      const existing = asnOlusturPending.get(cacheKey)
      if (existing) {
        try {
          const body = await Promise.race([ existing.promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)) ])
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body); return
        } catch (_) { asnOlusturPending.delete(cacheKey) }
      }
      const pendingPromise = new Promise((r) => { resolvePending = r })
      asnOlusturPending.set(cacheKey, { promise: pendingPromise })

      const getPo = r => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
      let uniquePo = [...new Set(rows.map(r => getPo(r)).filter(Boolean))]
      if (uniquePo.length === 0) uniquePo = ['']
      const importFileNumber = (data.importFileNumber ?? '').toString().trim()
      let runProcRows = []
      try {
        const promises = uniquePo.map(po => getVendorOrdersFromAllocation(companyCode, vendorCode, po, warehouseCode, importFileNumber))
        const results  = await Promise.all(promises)
        for (const chunk of results) { if (Array.isArray(chunk) && chunk.length > 0) runProcRows = runProcRows.concat(chunk) }
      } catch (err) {
        const errBody = JSON.stringify({ ok: false, error: err.message || String(err) })
        asnOlusturPending.delete(cacheKey); if (resolvePending) resolvePending(errBody)
        sendError(res, 502, err.message || String(err)); return
      }
      let inboundId
      try {
        await withLock(companyCode, vendorCode, async () => {
          const reserved  = await getReservedByDrafts(pool, companyCode, vendorCode, null)
          const breakdown = await getReservedBreakdown(pool, companyCode, vendorCode, null)
          const insuf     = checkRunProcSufficiency(runProcRows, rows, reserved)
          if (insuf.length > 0) {
            const detail = getInsufficientBarcodesDetail(runProcRows, rows, reserved, breakdown)
            const e = new Error('Yeterli açık sipariş olmayan EAN/barcode var.')
            e._type = 'insufficient'; e.insufficientBarcodes = insuf; e.insufficientBarcodesDetail = detail; throw e
          }
          const tr = await insertInbound(data)
          inboundId = tr.inboundId
        })
      } catch (lockErr) {
        if (lockErr?._type === 'insufficient') {
          asnOlusturPending.delete(cacheKey)
          let errBody
          try {
            const barcodes = Array.isArray(lockErr.insufficientBarcodes) ? lockErr.insufficientBarcodes : []
            const detail = Array.isArray(lockErr.insufficientBarcodesDetail) ? lockErr.insufficientBarcodesDetail.map(d => ({
              eanBarcode: d.eanBarcode != null ? String(d.eanBarcode) : '',
              poNumber: d.poNumber != null ? String(d.poNumber) : '',
              openOrderQty: typeof d.openOrderQty === 'number' ? d.openOrderQty : parseInt(String(d.openOrderQty), 10) || 0,
              loadedQty: typeof d.loadedQty === 'number' ? d.loadedQty : parseInt(String(d.loadedQty), 10) || 0,
              missingQty: typeof d.missingQty === 'number' ? d.missingQty : parseInt(String(d.missingQty), 10) || 0,
              erpOrders: Array.isArray(d.erpOrders) ? d.erpOrders.map(o => ({ orderNumber: String(o.orderNumber ?? ''), quantity: typeof o.quantity === 'number' ? o.quantity : parseInt(String(o.quantity), 10) || 0 })) : [],
              draftReservations: Array.isArray(d.draftReservations) ? d.draftReservations.map(r => ({ inboundId: typeof r.inboundId === 'number' ? r.inboundId : parseInt(String(r.inboundId), 10) || 0, quantity: typeof r.quantity === 'number' ? r.quantity : parseInt(String(r.quantity), 10) || 0 })) : [],
            })) : []
            errBody = JSON.stringify({ ok: false, error: lockErr.message || 'Yeterli açık sipariş olmayan EAN/barcode var.', insufficientBarcodes: barcodes, insufficientBarcodesDetail: detail })
          } catch (serializeErr) {
            errBody = JSON.stringify({ ok: false, error: lockErr.message || 'Yeterli açık sipariş olmayan EAN/barcode var.', insufficientBarcodes: [], insufficientBarcodesDetail: [] })
          }
          if (resolvePending) resolvePending(errBody)
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(errBody); return
        }
        throw lockErr
      }
      if (data.fileContent && data.fileName && inboundId) {
        const uploadPath = saveUploadedFile(data.fileContent, data.fileName, inboundId)
        if (uploadPath) {
          const upd = pool.getPreparedStatement('UPDATE dbo.Inbound SET UploadPath = ? WHERE InboundId = ?', 'write')
          await upd.run(uploadPath, inboundId)
        }
      }
      // ProcessCode: 6'lı eşleşme (Company + CurrAccCode + WarehouseCode + ImportFileNumber + PO + Barcode), onayla-erp ile aynı
      const key = (company, currAccCode, warehouseCode, impFileNum, po, barcode) =>
        [company || '', currAccCode || '', warehouseCode || '', (impFileNum != null ? String(impFileNum) : '').trim(), (po != null ? String(po).trim() : ''), (barcode || '').trim()].join('|')
      const getBarcode = (r) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
      const getPoFromRow = (r) => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
      const neededKeys = new Set(rows.filter(r => getBarcode(r)).map(r => key(companyCode, vendorCode, warehouseCode, importFileNumber, getPoFromRow(r), getBarcode(r))))
      const getErpBarcode = (row) => (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '').trim()
      const getErpPo = (row) => (row._poNumber != null ? String(row._poNumber) : row.ITAtt01 != null ? String(row.ITAtt01) : '').trim()
      const matchedRows = runProcRows.filter(row => neededKeys.has(key(companyCode, vendorCode, warehouseCode, importFileNumber, getErpPo(row), getErpBarcode(row))))
      const pcTrim = (r) => (r && r.ProcessCode != null ? String(r.ProcessCode).trim().toUpperCase() : '')
      const firstWithPc = matchedRows.length ? matchedRows.find(r => pcTrim(r)) : runProcRows.find(r => pcTrim(r))
      const processCodeForAsn = firstWithPc ? pcTrim(firstWithPc) : 'IP'
      try {
        const insAsn = pool.getPreparedStatement(
          `INSERT INTO dbo.InboundAsn (InboundId, AsnNo, CompanyCode, WarehouseCode, VendorCode, ChannelTemplateCode, ImportFileNumber, IsAllocation, IsCollected, CompletedDate, IsReturn, ProcessCode) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, 0, ?)`, 'write')
        const asnResult  = await insAsn.run(inboundId, null, companyCode, warehouseCode, vendorCode || null, data.channelTemplateCode || null, data.importFileNumber || null, processCodeForAsn)
        const inboundAsnId = asnResult.lastInsertRowid
        const getLines     = pool.getPreparedStatement('SELECT InboundLineId, PackageNumber, PONumber, Barcode, Quantity FROM dbo.InboundLine WHERE InboundId = ? ORDER BY InboundLineId', 'read')
        const lineIds      = await getLines.all(inboundId)
        const uniqueBarcodes = [...new Set(rows.map(r => r.barcode != null ? String(r.barcode).trim() : '').filter(Boolean))]
        let barcodeToItem = {}
        if (uniqueBarcodes.length > 0 && companyCode) {
          const batchRows = await getCachedItemBarcodeBatch(pool, companyCode, uniqueBarcodes)
          for (const r of batchRows) { const b = r.Barcode != null ? String(r.Barcode).trim() : ''; if (b) barcodeToItem[b] = r }
        }
        const insAsnLine = pool.getPreparedStatement(
          `INSERT INTO dbo.InboundAsnLine (InboundAsnId, InboundLineId, CaseCode, PurchaseOrderNo, EanCode, ProductCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'write')
        for (let i = 0; i < rows.length && i < lineIds.length; i++) {
          const line = lineIds[i]; const row = rows[i]
          const ib = row.barcode && companyCode ? barcodeToItem[String(row.barcode).trim()] : null
          const qty = row.quantity != null ? (typeof row.quantity === 'number' ? row.quantity : parseInt(String(row.quantity), 10) || 0) : 0
          await insAsnLine.run(inboundAsnId, line.InboundLineId, row.packageNumber != null ? String(row.packageNumber) : null, row.poNumber != null ? String(row.poNumber) : null, row.barcode != null ? String(row.barcode) : null, ib?.ItemCode ?? null, ib?.ColorCode ?? null, ib?.ItemDim1Code ?? null, ib?.ItemDim2Code ?? null, qty)
        }
        const insCollected = pool.getPreparedStatement(
          `INSERT INTO dbo.InboundAsnCollected (InboundAsnId, PurchaseOrderNo, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity) SELECT InboundAsnId, PurchaseOrderNo, ProductCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity FROM dbo.InboundAsnLine WHERE InboundAsnId = ?`, 'write')
        await insCollected.run(inboundAsnId)
        await runAsnRefProcedures(pool, inboundAsnId)
        const updStatus = pool.getPreparedStatement(`UPDATE dbo.Inbound SET Status = 'Onaylı' WHERE InboundId = ?`, 'write')
        await updStatus.run(inboundId)
        const sqlPool = await pool.getPool()
        const reqQueueAsn = sqlPool.request()
        reqQueueAsn.input('InboundAsnId', sql.Int, inboundAsnId)
        await reqQueueAsn.execute('dbo.CreateQueueForASN')
      } catch (err) {
        const errBody = JSON.stringify({ ok: false, error: err.message || String(err) })
        asnOlusturPending.delete(cacheKey); if (resolvePending) resolvePending(errBody)
        sendError(res, 500, err.message || String(err)); return
      }
      const successBody = JSON.stringify({ ok: true, inboundId, asnNo: null, queued: true, lineCount: rows.length })
      if (asnOlusturResponseCache) asnOlusturResponseCache.set(cacheKey, { body: successBody, ts: Date.now() })
      asnOlusturPending.delete(cacheKey); if (resolvePending) resolvePending(successBody)
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(successBody)
    } catch (err) {
      if (typeof cacheKey !== 'undefined') {
        asnOlusturPending.delete(cacheKey)
        if (typeof resolvePending !== 'undefined' && resolvePending) resolvePending(JSON.stringify({ ok: false, error: err.message || String(err) }))
      }
      sendError(res, 400, err.message || String(err))
    }
  })

  // ── POST /api/inbound/:id/onayla-erp ────────────────
  router.post('/api/inbound/:id/onayla-erp', wrapHandler(async (req, res, params) => {
    const inboundId = parseInt(params.id, 10)
    try { await readBody(req) } catch {}
    const pool = getPool()
    await pool.getPool()
    const getInbound = pool.getPreparedStatement('SELECT InboundId, CompanyCode, WarehouseCode, VendorCode, Status, ChannelTemplateCode, ImportFileNumber FROM dbo.Inbound WHERE InboundId = ?', 'read')
    const inbound    = await getInbound.get(inboundId)
    if (!inbound || inbound.Status !== 'Taslak') return sendError(res, 400, !inbound ? 'Kayıt bulunamadı.' : `Kayıt Taslak değil: ${inbound.Status}`)
    const getLines = pool.getPreparedStatement('SELECT Barcode AS barcode, Quantity AS quantity, PackageNumber AS packageNumber, PONumber AS poNumber FROM dbo.InboundLine WHERE InboundId = ? ORDER BY InboundLineId', 'read')
    const lines    = await getLines.all(inboundId)
    const rows     = lines.map(l => ({ barcode: l.barcode, quantity: l.quantity, packageNumber: l.packageNumber, poNumber: l.poNumber }))
    const companyCode   = inbound.CompanyCode   || ''
    const warehouseCode = inbound.WarehouseCode || ''
    const vendorCode    = inbound.VendorCode    || ''
    const channelTemplateCode = inbound.ChannelTemplateCode || ''
    const importFileNumber = (inbound.ImportFileNumber ?? '').toString().trim()
    const getPo = r => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
    const uniquePo = [...new Set(rows.map(r => getPo(r)).filter(Boolean))]
    let runProcRows = []
    try {
      const promises = uniquePo.map(po => getVendorOrdersFromAllocation(companyCode, vendorCode, po, warehouseCode, importFileNumber))
      const results  = await Promise.all(promises)
      for (const chunk of results) { if (Array.isArray(chunk) && chunk.length > 0) runProcRows = runProcRows.concat(chunk) }
    } catch (err) { return sendError(res, 502, err.message || String(err)) }
    const reserved  = await getReservedByDrafts(pool, companyCode, vendorCode, inboundId)
    const breakdown = await getReservedBreakdown(pool, companyCode, vendorCode, inboundId)
    const insuf     = checkRunProcSufficiency(runProcRows, rows, reserved)
    if (insuf.length > 0) {
      const detail = getInsufficientBarcodesDetail(runProcRows, rows, reserved, breakdown)
      return sendJson(res, 200, { ok: false, error: 'Yeterli açık sipariş olmayan EAN/barcode var.', insufficientBarcodes: insuf, insufficientBarcodesDetail: detail })
    }
    // ProcessCode: only from rows that match this inbound (Company + CurrAccCode + WarehouseCode + ImportFileNumber + PO + Barcode, same as DB query)
    const key = (company, currAccCode, warehouseCode, importFileNumber, po, barcode) =>
      [company || '', currAccCode || '', warehouseCode || '', (importFileNumber != null ? String(importFileNumber) : '').trim(), (po != null ? String(po).trim() : ''), (barcode || '').trim()].join('|')
    const getBarcode = (r) => (r.barcode != null ? String(r.barcode) : r.Barcode != null ? String(r.Barcode) : '').trim()
    const getPoFromRow = (r) => (r.poNumber != null ? String(r.poNumber) : r.poNo != null ? String(r.poNo) : '').trim()
    const neededKeys = new Set(rows.filter(r => getBarcode(r)).map(r => key(companyCode, vendorCode, warehouseCode, importFileNumber, getPoFromRow(r), getBarcode(r))))
    const getErpBarcode = (row) => (row.UsedBarcode != null ? String(row.UsedBarcode) : row.Barcode != null ? String(row.Barcode) : '').trim()
    const getErpPo = (row) => (row._poNumber != null ? String(row._poNumber) : row.ITAtt01 != null ? String(row.ITAtt01) : '').trim()
    const matchedRows = runProcRows.filter(row => neededKeys.has(key(companyCode, vendorCode, warehouseCode, importFileNumber, getErpPo(row), getErpBarcode(row))))
    const pcTrim = (r) => (r && r.ProcessCode != null ? String(r.ProcessCode).trim().toUpperCase() : '')
    const firstWithPc = matchedRows.length ? matchedRows.find(r => pcTrim(r)) : runProcRows.find(r => pcTrim(r))
    const processCode = firstWithPc ? pcTrim(firstWithPc) : 'IP'
    const getExisting = pool.getPreparedStatement('SELECT InboundAsnId FROM dbo.InboundAsn WHERE InboundId = ?', 'read')
    const existing    = await getExisting.get(inboundId)
    let inboundAsnId
    if (existing) {
      const upd = pool.getPreparedStatement('UPDATE dbo.InboundAsn SET AsnNo = NULL, ChannelTemplateCode = ?, ImportFileNumber = ?, ProcessCode = ?, CompletedDate = NULL WHERE InboundId = ?', 'write')
      await upd.run(inbound.ChannelTemplateCode || null, inbound.ImportFileNumber || null, processCode, inboundId)
      inboundAsnId = existing.InboundAsnId
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnLineSource WHERE InboundAsnId = ?', 'write').run(inboundAsnId)
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnLineSourceHeader WHERE InboundAsnId = ?', 'write').run(inboundAsnId)
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnLineRef WHERE InboundAsnLineId IN (SELECT InboundAsnLineId FROM dbo.InboundAsnLine WHERE InboundAsnId = ?)', 'write').run(inboundAsnId)
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnCase WHERE InboundAsnId = ?', 'write').run(inboundAsnId)
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnCollected WHERE InboundAsnId = ?', 'write').run(inboundAsnId)
      await pool.getPreparedStatement('DELETE FROM dbo.InboundAsnLine WHERE InboundAsnId = ?', 'write').run(inboundAsnId)
    } else {
      const ins = pool.getPreparedStatement(
        `INSERT INTO dbo.InboundAsn (InboundId, AsnNo, CompanyCode, WarehouseCode, VendorCode, ChannelTemplateCode, ImportFileNumber, IsAllocation, IsCollected, CompletedDate, IsReturn, ProcessCode) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, 0, ?)`, 'write')
      const r2 = await ins.run(inboundId, null, companyCode, warehouseCode, vendorCode || null, inbound.ChannelTemplateCode || null, inbound.ImportFileNumber || null, processCode)
      inboundAsnId = r2.lastInsertRowid
    }
    const getLineIds = pool.getPreparedStatement('SELECT InboundLineId FROM dbo.InboundLine WHERE InboundId = ? ORDER BY InboundLineId', 'read')
    const lineIds    = await getLineIds.all(inboundId)
    const uniqueBarcodes = [...new Set(lines.map(l => l.barcode).filter(Boolean).map(b => String(b).trim()))]
    let barcodeToItem = {}
    if (uniqueBarcodes.length && companyCode) {
      const batchRows = await getCachedItemBarcodeBatch(pool, companyCode, uniqueBarcodes)
      for (const r3 of batchRows) { const b = (r3.Barcode != null ? String(r3.Barcode) : '').trim(); if (b) barcodeToItem[b] = r3 }
    }
    const insLine = pool.getPreparedStatement(
      `INSERT INTO dbo.InboundAsnLine (InboundAsnId, InboundLineId, CaseCode, PurchaseOrderNo, EanCode, ProductCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'write')
    for (let i = 0; i < lines.length && i < lineIds.length; i++) {
      const ln = lineIds[i]; const row = lines[i]
      const ib = row.barcode ? barcodeToItem[String(row.barcode).trim()] : null
      await insLine.run(inboundAsnId, ln.InboundLineId, row.packageNumber || null, row.poNumber || null, row.barcode || null, ib?.ItemCode ?? null, ib?.ColorCode ?? null, ib?.ItemDim1Code ?? null, ib?.ItemDim2Code ?? null, row.quantity ?? 0)
    }
    const insColl = pool.getPreparedStatement(
      `INSERT INTO dbo.InboundAsnCollected (InboundAsnId, PurchaseOrderNo, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity) SELECT InboundAsnId, PurchaseOrderNo, ProductCode, ColorCode, ItemDim1Code, ItemDim2Code, Quantity FROM dbo.InboundAsnLine WHERE InboundAsnId = ?`, 'write')
    await insColl.run(inboundAsnId)
    await runAsnRefProcedures(pool, inboundAsnId)
    await pool.getPreparedStatement(`UPDATE dbo.Inbound SET Status = 'Onaylı' WHERE InboundId = ?`, 'write').run(inboundId)
    const sqlPool = await pool.getPool()
    const reqQueueAsn = sqlPool.request()
    reqQueueAsn.input('InboundAsnId', sql.Int, inboundAsnId)
    await reqQueueAsn.execute('dbo.CreateQueueForASN')
    sendOk(res, { inboundId, asnNo: null, queued: true })
  }))

  // ── GET /api/inbound/:id/lines ──────────────────────
  router.get('/api/inbound/:id/lines', wrapHandler(async (req, res, params) => {
    const inboundId = parseInt(params.id, 10)
    const pool = getPool()
    await pool.getPool()
    const stmt = pool.getPreparedStatement('SELECT PackageNumber AS caseCode, PONumber AS poNo, Barcode AS eanCode, Quantity AS quantity FROM dbo.InboundLine WHERE InboundId = ? ORDER BY InboundLineId', 'read')
    const rows = await stmt.all(inboundId)
    sendOk(res, { rows: rows.map(r => ({ caseCode: r.caseCode ?? '', poNo: r.poNo ?? '', eanCode: r.eanCode ?? '', quantity: r.quantity ?? 0 })) })
  }))

  // ── PUT /api/inbound/:id/lines ──────────────────────
  router.put('/api/inbound/:id/lines', wrapHandler(async (req, res, params) => {
    const inboundId = parseInt(params.id, 10)
    const pool = getPool()
    await pool.getPool()
    const data      = JSON.parse(await readBody(req))
    const lineIndex = data.lineIndex != null ? parseInt(String(data.lineIndex), 10) : -1
    const quantity  = data.quantity  != null ? (typeof data.quantity === 'number' ? data.quantity : parseInt(String(data.quantity), 10)) : null
    if (lineIndex < 0 || quantity === null || isNaN(quantity) || quantity < 0) return sendError(res, 400, 'lineIndex (0 tabanlı) ve quantity gerekli.')
    const getIds = pool.getPreparedStatement('SELECT InboundLineId FROM dbo.InboundLine WHERE InboundId = ? ORDER BY InboundLineId', 'read')
    const ids    = await getIds.all(inboundId)
    if (lineIndex >= ids.length) return sendError(res, 400, 'Geçersiz lineIndex.')
    const upd = pool.getPreparedStatement('UPDATE dbo.InboundLine SET Quantity = ? WHERE InboundLineId = ?', 'write')
    await upd.run(quantity, ids[lineIndex].InboundLineId)
    sendOk(res, { inboundId, lineIndex, quantity })
  }))

  // ── GET /api/asn-list ───────────────────────────────
  router.get('/api/asn-list', wrapHandler(async (req, res) => {
    const pool = getPool()
    await pool.getPool()
    const q         = getQueryParams(req.url)
    const firma     = (q.firma      || '').trim()
    const depo      = (q.depo       || '').trim()
    const satici    = (q.satici     || '').trim()
    let baslangic   = (q.baslangic  || '').trim().split(' ')[0]
    let bitis       = (q.bitis      || '').trim().split(' ')[0]
    const islemiYapan = (q.islemiYapan || '').trim()
    const durum     = (q.durum      || '').trim()
    const page      = Math.max(1, parseInt(q.page, 10) || 1)
    const pageSize  = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 10))
    const conditions = [], params = []
    if (firma)       { conditions.push('LTRIM(RTRIM(i.CompanyCode)) = LTRIM(RTRIM(?))'); params.push(firma) }
    if (depo)        { conditions.push('LTRIM(RTRIM(i.WarehouseCode)) = LTRIM(RTRIM(?))'); params.push(depo) }
    if (satici)      { conditions.push('LTRIM(RTRIM(i.VendorCode)) = LTRIM(RTRIM(?))'); params.push(satici) }
    if (baslangic)   { conditions.push('CAST(i.CreatedTime AS DATE) >= CAST(? AS DATE)'); params.push(baslangic) }
    if (bitis)       { conditions.push('CAST(i.CreatedTime AS DATE) <= CAST(? AS DATE)'); params.push(bitis) }
    if (islemiYapan) { conditions.push('LTRIM(RTRIM(CAST(i.CreatedUserId AS NVARCHAR(50)))) = LTRIM(RTRIM(?))'); params.push(islemiYapan) }
    if (durum)       { conditions.push('LTRIM(RTRIM(i.Status)) = LTRIM(RTRIM(?))'); params.push(durum) }
    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const offset = (page - 1) * pageSize
    const querySql = `
      SELECT * FROM (
        SELECT i.InboundId AS id, i.InboundId AS no, i.CompanyCode AS firma, i.WarehouseCode AS depoKodu,
          COALESCE(NULLIF(LTRIM(RTRIM(w.WarehouseDescription)),''), i.WarehouseCode) AS depoAdi,
          i.VendorCode AS saticiKodu, COALESCE(NULLIF(LTRIM(RTRIM(v.CurrAccDescription)),''), i.VendorCode) AS saticiAdi,
          i.Status AS durum, i.ImportFileNumber AS ithDosyaNo, i.InProgress AS islemdeMi,
          COALESCE(a.AsnNo,'') AS asnNo, i.FileName AS dosyaAdi, i.CreatedTime AS aktarimZamani,
          COALESCE(i.CreatedUserId,'') AS kullaniciAdi, COUNT(*) OVER() AS _totalCount
        FROM dbo.Inbound i
        LEFT JOIN dbo.InboundAsn a ON i.InboundId = a.InboundId
        LEFT JOIN dbo.cdWarehouse w ON LTRIM(RTRIM(CAST(w.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode)) AND w.WarehouseCode = i.WarehouseCode
        LEFT JOIN dbo.Vendor v ON LTRIM(RTRIM(CAST(v.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode)) AND LTRIM(RTRIM(v.CurrAccCode)) = LTRIM(RTRIM(i.VendorCode))
        ${where}
      ) sub ORDER BY sub.aktarimZamani DESC OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`
    const stmt  = pool.getPreparedStatement(querySql, 'read')
    const rows  = params.length ? await stmt.all(...params) : await stmt.all()
    const total = rows.length > 0 ? (rows[0]._totalCount ?? rows.length) : 0
    const list  = rows.map(r => ({
      id: String(r.id), no: String(r.no), firma: String(r.firma ?? ''),
      depoKodu: String(r.depoKodu ?? ''), depoAdi: String(r.depoAdi ?? ''),
      saticiKodu: String(r.saticiKodu ?? ''), saticiAdi: String(r.saticiAdi ?? ''),
      durum: String(r.durum ?? ''), ithDosyaNo: String(r.ithDosyaNo ?? ''),
      islemdeMi: Boolean(r.islemdeMi), asnNo: String(r.asnNo ?? ''),
      dosyaAdi: String(r.dosyaAdi ?? ''), aktarimZamani: String(r.aktarimZamani ?? ''),
      kullaniciAdi: String(r.kullaniciAdi ?? ''),
    }))
    sendOk(res, { rows: list, totalCount: total })
  }))

  // ── POST /api/inbound/:id/alokasyon-yap ─────────────
  router.post('/api/inbound/:id/alokasyon-yap', wrapHandler(async (req, res, params) => {
    const inboundId = parseInt(params.id, 10)
    const pool = getPool()
    await pool.getPool()
    const getInbound = pool.getPreparedStatement('SELECT InboundId, Status FROM dbo.Inbound WHERE InboundId = ?', 'read')
    const inbound    = await getInbound.get(inboundId)
    if (!inbound || inbound.Status !== 'Onaylı') return sendError(res, 400, 'Kayıt bulunamadı veya Onaylı değil.')
    const getAsn = pool.getPreparedStatement('SELECT InboundAsnId, CompanyCode FROM dbo.InboundAsn WHERE InboundId = ?', 'read')
    const asn    = await getAsn.get(inboundId)
    if (!asn) return sendError(res, 400, 'ASN kaydı bulunamadı.')
    const companyCode = asn.CompanyCode || null
    if (companyCode) {
      const getLinesToBackfill = pool.getPreparedStatement(
        `SELECT InboundAsnLineId, EanCode FROM dbo.InboundAsnLine WHERE InboundAsnId = ? AND EanCode IS NOT NULL AND LTRIM(RTRIM(EanCode)) <> '' AND (ProductCode IS NULL OR ColorCode IS NULL)`, 'read')
      const linesToBackfill = await getLinesToBackfill.all(asn.InboundAsnId)
      if (linesToBackfill && linesToBackfill.length > 0) {
        const barcodes = [...new Set(linesToBackfill.map(l => String(l.EanCode || '').trim()).filter(Boolean))]
        if (barcodes.length > 0) {
          const barcodeRows = await getCachedItemBarcodeBatch(pool, companyCode, barcodes)
          const barcodeMap = {}
          for (const r of barcodeRows || []) { const b = r.Barcode != null ? String(r.Barcode).trim() : ''; if (b) barcodeMap[b] = r }
          const updates = []
          for (const line of linesToBackfill) {
            const ib = barcodeMap[String(line.EanCode || '').trim()]
            if (ib) updates.push({ InboundAsnLineId: line.InboundAsnLineId, ItemCode: ib.ItemCode ?? null, ColorCode: ib.ColorCode ?? null, ItemDim1Code: ib.ItemDim1Code ?? null, ItemDim2Code: ib.ItemDim2Code ?? null })
          }
          if (updates.length > 0) {
            const CHUNK = 100
            const sqlPool = await pool.getPool()
            for (let off = 0; off < updates.length; off += CHUNK) {
              const chunk = updates.slice(off, off + CHUNK)
              const req2 = sqlPool.request()
              chunk.forEach((u, i) => {
                req2.input(`p${i * 5}`, sql.NVarChar(30), u.ItemCode)
                req2.input(`p${i * 5 + 1}`, sql.NVarChar(10), u.ColorCode)
                req2.input(`p${i * 5 + 2}`, sql.NVarChar(10), u.ItemDim1Code)
                req2.input(`p${i * 5 + 3}`, sql.NVarChar(10), u.ItemDim2Code)
                req2.input(`p${i * 5 + 4}`, sql.Int, u.InboundAsnLineId)
              })
              const insertVals = chunk.map((_, i) => `(@p${i * 5}, @p${i * 5 + 1}, @p${i * 5 + 2}, @p${i * 5 + 3}, @p${i * 5 + 4})`).join(', ')
              await req2.query(`
                IF OBJECT_ID('tempdb..#BackfillUpdates') IS NOT NULL DROP TABLE #BackfillUpdates;
                CREATE TABLE #BackfillUpdates (ItemCode NVARCHAR(30), ColorCode NVARCHAR(10), ItemDim1Code NVARCHAR(10), ItemDim2Code NVARCHAR(10), InboundAsnLineId INT);
                INSERT INTO #BackfillUpdates (ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, InboundAsnLineId) VALUES ${insertVals};
                UPDATE ial SET ial.ProductCode = u.ItemCode, ial.ColorCode = u.ColorCode, ial.ItemDim1Code = u.ItemDim1Code, ial.ItemDim2Code = u.ItemDim2Code
                FROM dbo.InboundAsnLine ial INNER JOIN #BackfillUpdates u ON ial.InboundAsnLineId = u.InboundAsnLineId;
              `)
            }
          }
        }
      }
    }
    const updAsn = pool.getPreparedStatement('UPDATE dbo.InboundAsn SET IsAllocation = 1, IsCollected = 1 WHERE InboundId = ?', 'write')
    await updAsn.run(inboundId)
    const updStatus = pool.getPreparedStatement('UPDATE dbo.Inbound SET Status = ? WHERE InboundId = ?', 'write')
    await updStatus.run('Alokasyon Yapılıyor', inboundId)
    const sqlPool = await pool.getPool()
    try {
      await sqlPool.request().execute('dbo.CreateRequest')
      const getReqs = pool.getPreparedStatement('SELECT RequestId FROM dbo.Request WHERE InboundAsnId = ? ORDER BY RequestId', 'read')
      const reqs    = await getReqs.all(asn.InboundAsnId)
      const reqIds  = (reqs || []).map(r => r.RequestId).filter(Boolean)
      for (const rid of reqIds) {
        const reqAlloc = sqlPool.request(); reqAlloc.input('RequestId', sql.Int, rid); await reqAlloc.execute('dbo.Allocation')
      }
      const getExReqs = pool.getPreparedStatement('SELECT RequestId FROM dbo.Request WHERE InboundAsnId = ? AND Exception = 1 AND AllocatedDate IS NULL ORDER BY RequestId', 'read')
      const exReqs = await getExReqs.all(asn.InboundAsnId)
      const exReqIds = (exReqs || []).map(r => r.RequestId).filter(Boolean)
      for (const rid of exReqIds) {
        const reqAlloc = sqlPool.request(); reqAlloc.input('RequestId', sql.Int, rid); await reqAlloc.execute('dbo.Allocation')
      }
      let queueError = null
      try {
        const reqQueueAlloc = sqlPool.request(); reqQueueAlloc.input('InboundAsnId', sql.Int, asn.InboundAsnId); await reqQueueAlloc.execute('dbo.CreateQueueForAllocation')
        const reqQueueAsn = sqlPool.request(); reqQueueAsn.input('InboundAsnId', sql.Int, asn.InboundAsnId); await reqQueueAsn.execute('dbo.CreateQueueForASN')
      } catch (queueErr) {
        queueError = queueErr.message || String(queueErr)
        console.error('[alokasyon-yap] Kuyruk doldurma hatası:', queueError)
      }
      const draftCountResult = await sqlPool.request()
        .input('InboundAsnId', sql.Int, asn.InboundAsnId)
        .query(`SELECT COUNT(*) AS n FROM dbo.DraftOrderHeader doh WHERE doh.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId)`)
      const queueCountResult = await sqlPool.request()
        .input('InboundAsnId', sql.Int, asn.InboundAsnId)
        .query(`SELECT COUNT(*) AS n FROM dbo.[Queue] q WHERE q.SourceId IN (SELECT DraftOrderHeaderId FROM dbo.DraftOrderHeader WHERE RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId))`)
      const draftOrderHeaderCount = (draftCountResult.recordset && draftCountResult.recordset[0] && draftCountResult.recordset[0].n) || 0
      const queueCount = (queueCountResult.recordset && queueCountResult.recordset[0] && queueCountResult.recordset[0].n) || 0
      const warning = (reqIds.length > 0 && (draftOrderHeaderCount === 0 || queueCount === 0))
        ? (draftOrderHeaderCount === 0
          ? 'Request atıldı ancak Allocation hiç DraftOrderHeader oluşturmadı (açık sipariş eşleşmesi yok olabilir). Kuyruk oluşmadı.'
          : 'Kuyruk kaydı oluşmadı. db/scripts/25a_Debug_QueueAfterAllocation.sql ile InboundAsnId=' + asn.InboundAsnId + ' teşhis edin.')
        : undefined
      sendOk(res, {
        requestCount: reqIds.length,
        requestIds: reqIds,
        draftOrderHeaderCount,
        queueCount,
        queueError: queueError || undefined,
        warning: warning || undefined,
      })
    } catch (err) {
      const detail = (err.originalError && err.originalError.message) || (err.precedingErrors && err.precedingErrors[0] && err.precedingErrors[0].message) || err.message
      console.error('[alokasyon-yap]', err.message, err.originalError || err)
      try { await updStatus.run('Onaylı', inboundId) } catch {}
      sendError(res, 500, 'Alokasyon hatası: ' + (detail || String(err)))
    }
  }))
}

module.exports = { register }
