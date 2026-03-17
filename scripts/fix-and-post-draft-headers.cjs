/**
 * 418, 419, 444, 451 DraftOrderHeaderId'ler için:
 * 1) ReserveLineId backfill (QueueLogDetail response'tan satır sırasına göre)
 * 2) Queue: IsMaxTry=0, TryCount=0, JsonData view'dan güncelle
 * 3) Kuyruk işleyici ile ERP'ye POST, başarılı sonuç al
 * Kullanım: node scripts/fix-and-post-draft-headers.cjs
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path = require('path')
  const root = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.ERP_INTEGRATOR_PASSWORD) dotenv.config({ path: path.join(root, '.env.example') })
})()

const sql = require('mssql')
const { getPool } = require('./db/connection-pool.cjs')
const { getErpToken, erpPost } = require('./shared/erp-client.cjs')

const DRAFT_HEADER_IDS = [418, 419, 444, 451]

function log(msg, data) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${msg}`)
  if (data !== undefined && data !== null) console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data)
}

async function main() {
  console.log('ORCA – Rezervasyon düzeltme + Kuyruk sıfırlama + POST')
  console.log('DraftOrderHeaderIds:', DRAFT_HEADER_IDS.join(', '))

  const pool = getPool()
  let sqlPool
  try {
    sqlPool = await pool.getPool()
  } catch (err) {
    log('DB bağlantı hatası', err.message)
    process.exit(1)
  }

  // 1) Backfill ReserveLineIds (QueueLogDetail'deki response'a göre)
  log('1. BackfillReserveLineIdsForDraftOrder çalıştırılıyor...')
  for (const id of DRAFT_HEADER_IDS) {
    try {
      await sqlPool.request().input('DraftOrderHeaderId', sql.Int, id).execute('dbo.BackfillReserveLineIdsForDraftOrder')
      log(`   DraftOrderHeaderId=${id} backfill tamamlandı`)
    } catch (e) {
      log(`   DraftOrderHeaderId=${id} backfill atlandı/hata`, e.message)
    }
  }

  // 2) Queue sıfırla (IsMaxTry=0, TryCount=0) + JsonData view'dan güncelle
  log('2. ResetQueueForRetry (Reserve 5, DispOrder 6) + RefreshQueueJsonDataForDraftOrder...')
  for (const sourceTypeId of [5, 6]) {
    for (const sourceId of DRAFT_HEADER_IDS) {
      try {
        const req = sqlPool.request()
        req.input('SourceTypeId', sql.Int, sourceTypeId)
        req.input('SourceId', sql.Int, sourceId)
        await req.execute('dbo.ResetQueueForRetry')
        log(`   SourceTypeId=${sourceTypeId} SourceId=${sourceId} sıfırlandı`)
      } catch (e) {
        log(`   SourceTypeId=${sourceTypeId} SourceId=${sourceId} hata`, e.message)
      }
    }
  }
  try {
    await sqlPool.request()
      .input('DraftOrderHeaderIds', sql.NVarChar(500), DRAFT_HEADER_IDS.join(','))
      .execute('dbo.RefreshQueueJsonDataForDraftOrder')
    log('   RefreshQueueJsonDataForDraftOrder tamamlandı')
  } catch (e) {
    log('   RefreshQueueJsonDataForDraftOrder hata', e.message)
  }

  // 3) GetQueueList → POST (sadece bu header'lara ait kuyrukları işle)
  log('3. GetQueueList ve ERP POST...')
  let batchSize = 100
  try {
    const pv = (await sqlPool.request().query("SELECT ParameterValue FROM dbo.SystemParameter WHERE ParameterKey = N'QueueBatchSize'")).recordset?.[0]?.ParameterValue
    if (pv != null) { const n = parseInt(String(pv), 10); if (Number.isFinite(n) && n > 0) batchSize = n }
  } catch (_) {}
  const listReq = sqlPool.request().input('BatchSize', sql.Int, batchSize)
  const listResult = await listReq.execute('dbo.GetQueueList')
  const rows = listResult.recordset || []
  const ourIds = new Set(DRAFT_HEADER_IDS)
  const ourRows = rows.filter((r) => r.SourceTypeId !== undefined && ourIds.has(r.SourceId))
  if (ourRows.length === 0) {
    log('BİTTİ', 'Bu header\'lara ait IsCompleted=0, IsMaxTry=0 kuyruk kaydı yok. (GetQueueList tüm listeyi döndü; filtre: SourceId IN (418,419,444,451)).')
    process.exit(0)
  }
  log(`   İşlenecek kayıt: ${ourRows.length} (QueueIds: ${ourRows.map((r) => r.QueueId).join(', ')})`)

  let token
  try {
    token = await getErpToken()
  } catch (err) {
    log('ERP token hatası', err.message)
    process.exit(1)
  }
  const postPath = `/IntegratorService/Post/${encodeURIComponent(token)}`
  let succeeded = 0
  let failed = 0

  for (const row of ourRows) {
    const queueId = row.QueueId
    const jsonData = row.JsonData != null ? String(row.JsonData) : ''
    const startDate = new Date()
    log(`   [QueueId=${queueId}] SourceTypeId=${row.SourceTypeId} SourceId=${row.SourceId} POST gönderiliyor...`)

    let queueLogId
    try {
      const insLog = sqlPool.request().input('QueueId', sql.Int, queueId).output('QueueLogId', sql.Int)
      const insRes = await insLog.execute('dbo.InsertQueueLog')
      queueLogId = insRes.output?.QueueLogId ?? insRes.recordset?.[0]?.QueueLogId
    } catch (e) {
      log(`   QueueId=${queueId} InsertQueueLog hatası`, e.message)
      failed++
      continue
    }

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
      const hasResult = parsed?.Result != null || parsed?.Data != null
      success = ok || (noError && (parsed?.HeaderID != null || parsed?.ApplicationID != null || parsed?.ApplicationId != null || hasResult))
      log(`   QueueId=${queueId} ERP yanıt: ${success ? 'Success' : 'Success değil'}`)
    } catch (e) {
      errMsg = e.message || String(e)
      log(`   QueueId=${queueId} ERP hatası`, errMsg)
    }

    const endDate = new Date()
    await sqlPool.request()
      .input('QueueLogId', sql.Int, queueLogId)
      .input('IsSuccess', sql.Bit, success ? 1 : 0)
      .execute('dbo.UpdateQueueLog')
    await sqlPool.request()
      .input('QueueLogId', sql.Int, queueLogId)
      .input('QueueId', sql.Int, queueId)
      .input('DetailType', sql.NVarChar(50), 'Post')
      .input('StartDate', sql.DateTime, startDate)
      .input('EndDate', sql.DateTime, endDate)
      .input('Response', sql.NVarChar(sql.MAX), responseText || '')
      .input('ExceptionMessage', sql.NVarChar(sql.MAX), errMsg || '')
      .input('IsSuccess', sql.Bit, success ? 1 : 0)
      .execute('dbo.InsertQueueLogDetail')

    if (success) {
      await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnSuccess')
      succeeded++
      log(`   QueueId=${queueId} → UpdateQueueOnSuccess (IsCompleted=1)`)
    } else {
      await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnFailure')
      failed++
      log(`   QueueId=${queueId} → UpdateQueueOnFailure`)
    }
  }

  console.log('')
  log('ÖZET', `İşlenen: ${ourRows.length} | Başarılı: ${succeeded} | Hata: ${failed}`)
  if (succeeded > 0) log('Tamamlandı', 'Başarılı POST sonuçları alındı.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
