const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const { getErpToken, erpPost } = require('../../shared/erp-client.cjs')
const { updateDraftFromQueueSuccess } = require('../helpers.cjs')

/** Tek kuyruk satırını post eder; log/success/failure ve ASN/Draft işlemlerini yapar. */
async function processOneRow(row, sqlPool, postPath) {
  const queueId = row.QueueId
  const jsonData = row.JsonData != null ? String(row.JsonData) : ''
  const startDate = new Date()
  const insLogReq = sqlPool.request()
  insLogReq.input('QueueId', sql.Int, queueId)
  insLogReq.output('QueueLogId', sql.Int)
  const insLogResult = await insLogReq.execute('dbo.InsertQueueLog')
  const queueLogId = insLogResult.output?.QueueLogId ?? insLogResult.recordset?.[0]?.QueueLogId
  if (!queueLogId) return { queueId, success: false, error: 'QueueLog insert hatası' }

  let success = false, responseText = '', errMsg = ''
  try {
    responseText = await erpPost(postPath, jsonData)
    const parsed = JSON.parse(responseText)
    const ok = parsed?.Success === true || parsed?.success === true || parsed?.IsSuccess === true || parsed?.isSuccess === true || parsed?.Success === 1 || parsed?.success === 1
    const noError = (parsed?.StatusCode == null || Number(parsed?.StatusCode) < 400) && !parsed?.ExceptionMessage
    success = ok || (noError && (parsed?.HeaderID != null || parsed?.ApplicationID != null || parsed?.ApplicationId != null))
  } catch (e) { errMsg = e.message || String(e) }

  const endDate = new Date()
  await sqlPool.request().input('QueueLogId', sql.Int, queueLogId).input('IsSuccess', sql.Bit, success ? 1 : 0).execute('dbo.UpdateQueueLog')
  const detailReq = sqlPool.request()
  detailReq.input('QueueLogId', sql.Int, queueLogId)
  detailReq.input('QueueId', sql.Int, queueId)
  detailReq.input('DetailType', sql.NVarChar(50), 'Post')
  detailReq.input('StartDate', sql.DateTime, startDate)
  detailReq.input('EndDate', sql.DateTime, endDate)
  detailReq.input('Response', sql.NVarChar(sql.MAX), responseText || '')
  detailReq.input('ExceptionMessage', sql.NVarChar(sql.MAX), errMsg || '')
  detailReq.input('IsSuccess', sql.Bit, success ? 1 : 0)
  await detailReq.execute('dbo.InsertQueueLogDetail')

  if (success) {
    await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnSuccess')
    if (row.SourceTypeId === 1 || row.SourceTypeId === 2 || row.SourceTypeId === 3) {
      try {
        const parsed = JSON.parse(responseText || '{}')
        const asnNo = parsed?.OrderAsnNumber ?? parsed?.orderAsnNumber ?? parsed?.AsnNo ?? parsed?.asnNo ?? parsed?.DocumentNo ?? parsed?.documentNo
        if (asnNo != null && String(asnNo).trim() !== '') {
          await sqlPool.request().input('InboundAsnId', sql.Int, row.SourceId).input('AsnNo', sql.NVarChar(50), String(asnNo).trim()).query('UPDATE dbo.InboundAsn SET AsnNo = @AsnNo, CompletedDate = GETDATE() WHERE InboundAsnId = @InboundAsnId')
          await sqlPool.request().input('InboundAsnId', sql.Int, row.SourceId).query("UPDATE i SET i.Status = N'Onaylı' FROM dbo.Inbound i INNER JOIN dbo.InboundAsn ia ON ia.InboundId = i.InboundId WHERE ia.InboundAsnId = @InboundAsnId")
        }
      } catch (_) {}
    }
    if (row.SourceTypeId === 4 || row.SourceTypeId === 5 || row.SourceTypeId === 6) {
      const successorScript = (row.SuccessorScript || '').trim()
      if (successorScript && /^EXEC\s+dbo\.MissionAccomplished\s+\d+\s*$/i.test(successorScript)) {
        try { await sqlPool.request().query(successorScript) } catch (succErr) { console.error('[queue] SuccessorScript hatası (QueueId=%s):', queueId, succErr?.message || succErr) }
      } else {
        try { await updateDraftFromQueueSuccess(sqlPool, row, responseText) } catch (draftErr) { console.error('[queue] Draft güncelleme hatası (QueueId=%s):', queueId, draftErr?.message || draftErr) }
      }
      if (row.SourceTypeId === 5 || row.SourceTypeId === 4) {
        try { await sqlPool.request().execute('dbo.CreateQueueForAllocation') } catch (allocErr) { console.error('[queue] CreateQueueForAllocation hatası:', allocErr?.message || allocErr) }
      }
      try { await sqlPool.request().input('DraftOrderHeaderId', sql.Int, row.SourceId).execute('dbo.SetRequestCompletedIfAllDraftsComplete') } catch (reqErr) { console.error('[queue] SetRequestCompletedIfAllDraftsComplete hatası (QueueId=%s):', queueId, reqErr?.message || reqErr) }
    }
    return { queueId, success: true }
  } else {
    await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnFailure')
    if (row.SourceTypeId === 1 || row.SourceTypeId === 2 || row.SourceTypeId === 3) {
      await sqlPool.request().input('QueueId', sql.Int, queueId).query("UPDATE i SET i.Status = N'Taslak' FROM dbo.Inbound i INNER JOIN dbo.InboundAsn ia ON ia.InboundId = i.InboundId INNER JOIN dbo.[Queue] q ON q.SourceId = ia.InboundAsnId AND q.SourceTypeId IN (1,2,3) WHERE q.QueueId = @QueueId AND q.IsMaxTry = 1")
    }
    return { queueId, success: false, error: errMsg || responseText }
  }
}

function register(router) {
  router.post('/api/queue/process', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.LogMaintenance')

    let batchSize = 100
    let chunkSize = 0
    try {
      const paramResult = await sqlPool.request().query("SELECT ParameterKey, ParameterValue FROM dbo.SystemParameter WHERE ParameterKey IN (N'QueueBatchSize', N'QueuePostChunkSize')")
      const paramMap = {}
      for (const r of paramResult.recordset || []) paramMap[r.ParameterKey] = r.ParameterValue
      const pvBatch = paramMap['QueueBatchSize']
      if (pvBatch != null) { const n = parseInt(String(pvBatch), 10); if (Number.isFinite(n) && n > 0) batchSize = n }
      const pvChunk = paramMap['QueuePostChunkSize']
      if (pvChunk != null) { const n = parseInt(String(pvChunk).trim(), 10); if (Number.isFinite(n) && n > 0) chunkSize = n }
    } catch (_) {}

    const listReq = sqlPool.request()
    listReq.input('BatchSize', sql.Int, batchSize)
    const listResult = await listReq.execute('dbo.GetQueueList')
    const rows = listResult.recordset || []
    if (rows.length === 0) return sendOk(res, { processed: 0, succeeded: 0, failed: 0, results: [] })

    let token
    try { token = await getErpToken() } catch (err) { return sendError(res, 502, 'ERP token alınamadı: ' + (err.message || String(err))) }
    const postPath = `/IntegratorService/Post/${encodeURIComponent(token)}`

    const results = []
    let succeeded = 0, failed = 0

    if (chunkSize > 0) {
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const chunkResults = await Promise.all(chunk.map(row => processOneRow(row, sqlPool, postPath)))
        for (const r of chunkResults) {
          results.push(r)
          if (r.success) succeeded++; else failed++
        }
      }
    } else {
      for (const row of rows) {
        const r = await processOneRow(row, sqlPool, postPath)
        results.push(r)
        if (r.success) succeeded++; else failed++
      }
    }

    sendOk(res, { processed: rows.length, succeeded, failed, results })
  }))
}

module.exports = { register }
