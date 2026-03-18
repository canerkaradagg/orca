import { getPool } from '../../db/connection-pool'
import sql from 'mssql'
import { sendOk, sendError, wrapHandler } from '../middleware'
import { getErpToken, erpPost } from '../../shared/erp-client'
import { requireAuthOrInternalKey } from '../auth-middleware'
import logger from '../../lib/logger'
import { updateDraftFromQueueSuccess } from '../helpers'
import type { Router } from '../router'

/** Tek kuyruk satırını post eder; log/success/failure ve ASN/Draft işlemlerini yapar. */
async function processOneRow(row: Record<string, unknown>, sqlPool: sql.ConnectionPool, postPath: string): Promise<{ queueId: number; success: boolean; error?: string }> {
  const queueId = row.QueueId as number
  const jsonData = row.JsonData != null ? String(row.JsonData) : ''
  const startDate = new Date()
  const insLogReq = sqlPool.request()
  insLogReq.input('QueueId', sql.Int, queueId)
  insLogReq.output('QueueLogId', sql.Int)
  const insLogResult = await insLogReq.execute('dbo.InsertQueueLog')
  const queueLogId = (insLogResult.output as Record<string, unknown>)?.QueueLogId ?? (insLogResult.recordset as Record<string, unknown>[])?.[0]?.QueueLogId
  if (!queueLogId) return { queueId, success: false, error: 'QueueLog insert hatası' }

  let success = false
  let responseText = ''
  let errMsg = ''
  try {
    responseText = await erpPost(postPath, jsonData)
    const parsed = JSON.parse(responseText) as Record<string, unknown>
    const ok = parsed?.Success === true || parsed?.success === true || parsed?.IsSuccess === true || parsed?.isSuccess === true || parsed?.Success === 1 || parsed?.success === 1
    const noError = (parsed?.StatusCode == null || Number(parsed?.StatusCode) < 400) && !parsed?.ExceptionMessage
    success = ok || (noError && (parsed?.HeaderID != null || parsed?.ApplicationID != null || parsed?.ApplicationId != null))
  } catch (e) { errMsg = (e as Error).message || String(e) }

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
        const parsed = JSON.parse(responseText || '{}') as Record<string, unknown>
        const asnNo = parsed?.OrderAsnNumber ?? parsed?.orderAsnNumber ?? parsed?.AsnNo ?? parsed?.asnNo ?? parsed?.DocumentNo ?? parsed?.documentNo
        if (asnNo != null && String(asnNo).trim() !== '') {
          await sqlPool.request().input('InboundAsnId', sql.Int, row.SourceId).input('AsnNo', sql.NVarChar(50), String(asnNo).trim()).query('UPDATE dbo.InboundAsn SET AsnNo = @AsnNo, CompletedDate = GETDATE() WHERE InboundAsnId = @InboundAsnId')
          await sqlPool.request().input('InboundAsnId', sql.Int, row.SourceId).query("UPDATE i SET i.Status = N'Onaylı' FROM dbo.Inbound i INNER JOIN dbo.InboundAsn ia ON ia.InboundId = i.InboundId WHERE ia.InboundAsnId = @InboundAsnId")
        }
      } catch (_) {}
    }
    if (row.SourceTypeId === 4 || row.SourceTypeId === 5 || row.SourceTypeId === 6) {
      const successorScript = (row.SuccessorScript || '').toString().trim()
      if (successorScript && /^EXEC\s+dbo\.MissionAccomplished\s+\d+\s*$/i.test(successorScript)) {
        try { await sqlPool.request().query(successorScript) } catch (succErr) { logger.error({ queueId, err: (succErr as Error)?.message || succErr }, 'queue SuccessorScript hatası') }
      } else {
        try { await updateDraftFromQueueSuccess(sqlPool, row as { SourceTypeId: number; SourceId: number }, responseText) } catch (draftErr) { logger.error({ queueId, err: (draftErr as Error)?.message || draftErr }, 'queue Draft güncelleme hatası') }
      }
      if (row.SourceTypeId === 5 || row.SourceTypeId === 4) {
        try { await sqlPool.request().execute('dbo.CreateQueueForAllocation') } catch (allocErr) { logger.error({ err: (allocErr as Error)?.message || allocErr }, 'queue CreateQueueForAllocation hatası') }
      }
      try { await sqlPool.request().input('DraftOrderHeaderId', sql.Int, row.SourceId).execute('dbo.SetRequestCompletedIfAllDraftsComplete') } catch (reqErr) { logger.error({ queueId, err: (reqErr as Error)?.message || reqErr }, 'queue SetRequestCompletedIfAllDraftsComplete hatası') }
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

export function register(router: Router): void {
  router.post('/api/queue/process', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.LogMaintenance')

    let batchSize = 100
    let chunkSize = 0
    try {
      const paramResult = await sqlPool.request().query("SELECT ParameterKey, ParameterValue FROM dbo.SystemParameter WHERE ParameterKey IN (N'QueueBatchSize', N'QueuePostChunkSize')")
      const paramMap: Record<string, string> = {}
      for (const r of (paramResult.recordset as Record<string, unknown>[]) || []) paramMap[r.ParameterKey as string] = r.ParameterValue as string
      const pvBatch = paramMap['QueueBatchSize']
      if (pvBatch != null) { const n = parseInt(String(pvBatch), 10); if (Number.isFinite(n) && n > 0) batchSize = n }
      const pvChunk = paramMap['QueuePostChunkSize']
      if (pvChunk != null) { const n = parseInt(String(pvChunk).trim(), 10); if (Number.isFinite(n) && n > 0) chunkSize = n }
    } catch (_) {}

    const listReq = sqlPool.request()
    listReq.input('BatchSize', sql.Int, batchSize)
    const listResult = await listReq.execute('dbo.GetQueueList')
    const rows = (listResult.recordset as Record<string, unknown>[]) || []
    if (rows.length === 0) return sendOk(res, { processed: 0, succeeded: 0, failed: 0, results: [] })

    let token: string
    try { token = await getErpToken() } catch (err) { return sendError(res, 502, 'ERP token alınamadı: ' + ((err as Error).message || String(err))) }
    const postPath = `/IntegratorService/Post/${encodeURIComponent(token)}`

    const results: { queueId: number; success: boolean; error?: string }[] = []
    let succeeded = 0
    let failed = 0

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
  })))
}
