/**
 * Kuyruk işleme – adım adım çalıştırma, her adımın sonucu konsola yazılır.
 * Kullanım: node scripts/queue-process-step-by-step.cjs
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path = require('path')
  const root = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.ERP_INTEGRATOR_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

const sql = require('mssql')
const { getPool } = require('./db/connection-pool.cjs')
const { getErpToken, erpPost } = require('./shared/erp-client.cjs')

const SEP = '────────────────────────────────────────────────────────────'

function log(step, msg, data) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${step}: ${msg}`)
  if (data !== undefined) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      console.log(JSON.stringify(data, null, 2))
    } else {
      console.log(data)
    }
  }
}

async function main() {
  console.log(SEP)
  console.log('ORCA – Kuyruk eritme (adım adım)')
  console.log(SEP)

  const pool = getPool()
  let sqlPool
  try {
    sqlPool = await pool.getPool()
  } catch (err) {
    log('HATA', 'DB bağlantısı kurulamadı', err.message)
    process.exit(1)
  }

  // ── Adım 1: LogMaintenance ─────────────────────────────
  log('1', 'LogMaintenance çalıştırılıyor (TryCount>=10 olanlarda IsMaxTry=1)...')
  try {
    await sqlPool.request().execute('dbo.LogMaintenance')
    log('1', 'LogMaintenance tamamlandı.')
  } catch (err) {
    log('1', 'LogMaintenance hatası', err.message)
    process.exit(1)
  }
  console.log(SEP)

  // ── Adım 2: GetQueueList ───────────────────────────────
  log('2', 'GetQueueList çağrılıyor (IsCompleted=0, IsMaxTry=0, JsonData dolu kayıtlar)...')
  let rows = []
  try {
    let batchSize = 100
    try {
      const paramResult = await sqlPool.request().query("SELECT ParameterValue FROM dbo.SystemParameter WHERE ParameterKey = N'QueueBatchSize'")
      const pv = paramResult.recordset?.[0]?.ParameterValue
      if (pv != null) { const n = parseInt(String(pv), 10); if (Number.isFinite(n) && n > 0) batchSize = n }
    } catch (_) {}
    const listReq = sqlPool.request()
    listReq.input('BatchSize', sql.Int, batchSize)
    const listResult = await listReq.execute('dbo.GetQueueList')
    rows = listResult.recordset || []
    log('2', `GetQueueList sonucu: ${rows.length} kayıt listelendi.`)
    if (rows.length === 0) {
      console.log(SEP)
      log('BİTTİ', 'Kuyrukta işlenecek kayıt yok.')
      process.exit(0)
    }
    rows.forEach((r, i) => {
      const jsonPreview = r.JsonData ? (String(r.JsonData).length > 80 ? String(r.JsonData).slice(0, 80) + '...' : String(r.JsonData)) : '(boş)'
      console.log(`   [${i + 1}] QueueId=${r.QueueId} SourceTypeId=${r.SourceTypeId} SourceId=${r.SourceId} Company=${r.Company || '-'} TryCount=${r.TryCount} JsonData(${String(r.JsonData || '').length} char)`)
    })
  } catch (err) {
    log('2', 'GetQueueList hatası', err.message)
    process.exit(1)
  }
  console.log(SEP)

  // ── Adım 3: ERP Token ──────────────────────────────────
  log('3', 'ERP token alınıyor...')
  let token
  try {
    token = await getErpToken()
    log('3', `Token alındı (${token ? token.length : 0} karakter).`)
  } catch (err) {
    log('3', 'ERP token hatası', err.message)
    process.exit(1)
  }
  console.log(SEP)

  const postPath = `/IntegratorService/Post/${encodeURIComponent(token)}`
  log('4', `POST adresi hazır: ...${postPath.slice(0, 50)}...`)
  console.log(SEP)

  let succeeded = 0
  let failed = 0

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]
    const queueId = row.QueueId
    const jsonData = row.JsonData != null ? String(row.JsonData) : ''
    const startDate = new Date()

    console.log('')
    log(`5.${idx + 1}`, `[QueueId=${queueId}] İşlem başlıyor. SourceTypeId=${row.SourceTypeId} SourceId=${row.SourceId}`)

    // InsertQueueLog
    const insLogReq = sqlPool.request()
    insLogReq.input('QueueId', sql.Int, queueId)
    insLogReq.output('QueueLogId', sql.Int)
    let queueLogId
    try {
      const insLogResult = await insLogReq.execute('dbo.InsertQueueLog')
      queueLogId = insLogResult.output?.QueueLogId ?? insLogResult.recordset?.[0]?.QueueLogId
      log(`5.${idx + 1}`, `  QueueLog eklendi: QueueLogId=${queueLogId}`)
    } catch (e) {
      log(`5.${idx + 1}`, `  QueueLog insert hatası`, e.message)
      failed++
      continue
    }

    // ERP POST
    log(`5.${idx + 1}`, `  ERP'ye POST gönderiliyor (body uzunluğu: ${jsonData.length} karakter)...`)
    let success = false
    let responseText = ''
    let errMsg = ''
    try {
      responseText = await erpPost(postPath, jsonData)
      const parsed = JSON.parse(responseText)
      const ok = parsed?.Success === true || parsed?.success === true ||
        parsed?.IsSuccess === true || parsed?.isSuccess === true ||
        parsed?.Success === 1 || parsed?.success === 1
      const noError = (parsed?.StatusCode == null || Number(parsed?.StatusCode) < 400) && !parsed?.ExceptionMessage
      success = ok || (noError && (parsed?.HeaderID != null || parsed?.ApplicationID != null || parsed?.ApplicationId != null))
      log(`5.${idx + 1}`, `  ERP yanıtı: ${success ? 'Success' : 'Success değil'}`, responseText.length > 500 ? responseText.slice(0, 500) + '...' : responseText)
    } catch (e) {
      errMsg = e.message || String(e)
      log(`5.${idx + 1}`, `  ERP hatası`, errMsg)
    }

    const endDate = new Date()

    // UpdateQueueLog
    const updLogReq = sqlPool.request()
    updLogReq.input('QueueLogId', sql.Int, queueLogId)
    updLogReq.input('IsSuccess', sql.Bit, success ? 1 : 0)
    await updLogReq.execute('dbo.UpdateQueueLog')
    log(`5.${idx + 1}`, `  QueueLog güncellendi (IsSuccess=${success})`)

    // InsertQueueLogDetail
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
    log(`5.${idx + 1}`, `  QueueLogDetail eklendi`)

    if (success) {
      await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnSuccess')
      if (row.SourceTypeId === 1 || row.SourceTypeId === 2 || row.SourceTypeId === 3) {
        try {
          const parsed = JSON.parse(responseText || '{}')
          const asnNo = parsed?.OrderAsnNumber ?? parsed?.orderAsnNumber ?? parsed?.AsnNo ?? parsed?.asnNo ?? parsed?.DocumentNo ?? parsed?.documentNo
          if (asnNo != null && String(asnNo).trim() !== '') {
            const updAsn = sqlPool.request()
            updAsn.input('InboundAsnId', sql.Int, row.SourceId)
            updAsn.input('AsnNo', sql.NVarChar(50), String(asnNo).trim())
            await updAsn.query('UPDATE dbo.InboundAsn SET AsnNo = @AsnNo, CompletedDate = GETDATE() WHERE InboundAsnId = @InboundAsnId')
            log(`5.${idx + 1}`, `  → InboundAsn.AsnNo güncellendi: ${String(asnNo).trim()}`)
          }
        } catch (_) {}
      }
      succeeded++
      log(`5.${idx + 1}`, `  → UpdateQueueOnSuccess: IsCompleted=1 (kayıt eridi.)`)
    } else {
      await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnFailure')
      if (row.SourceTypeId === 1 || row.SourceTypeId === 2 || row.SourceTypeId === 3) {
        const rollbackReq = sqlPool.request()
        rollbackReq.input('QueueId', sql.Int, queueId)
        const rollbackRes = await rollbackReq.query(`
          UPDATE i SET i.Status = N'Taslak'
          FROM dbo.Inbound i
          INNER JOIN dbo.InboundAsn ia ON ia.InboundId = i.InboundId
          INNER JOIN dbo.[Queue] q ON q.SourceId = ia.InboundAsnId AND q.SourceTypeId IN (1,2,3)
          WHERE q.QueueId = @QueueId AND q.IsMaxTry = 1
        `)
        if (rollbackRes?.rowsAffected?.[0] > 0) {
          log(`5.${idx + 1}`, `  → Rollback: Inbound Status = Taslak (10 deneme aşıldı)`)
        }
      }
      failed++
      log(`5.${idx + 1}`, `  → UpdateQueueOnFailure: TryCount artırıldı; 10 ise IsMaxTry=1 (kayıt eridi.)`)
    }
  }

  console.log('')
  console.log(SEP)
  log('ÖZET', `İşlenen: ${rows.length} | Başarılı: ${succeeded} | Hata: ${failed}`)
  console.log(SEP)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
