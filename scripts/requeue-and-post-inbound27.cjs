/**
 * InboundId=27 için ASN'i tekrar kuyruğa atar ve ERP'ye post eder.
 * 1) AsnNo=NULL yap, eski kuyruk kaydını sil, CreateQueueForASN çalıştır
 * 2) Yeni kuyruk kaydını al, ERP'ye POST et, sonucu güncelle
 * Kullanım: node scripts/requeue-and-post-inbound27.cjs
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

const INBOUND_ID = 27

async function main() {
  console.log('InboundId=' + INBOUND_ID + ' için ASN kuyruğa atılıyor ve ERP\'ye post ediliyor...\n')

  const pool = getPool()
  const sqlPool = await pool.getPool()

  const getAsn = await sqlPool.request().input('InboundId', sql.Int, INBOUND_ID)
    .query('SELECT InboundAsnId FROM dbo.InboundAsn WHERE InboundId = @InboundId')
  const asnRow = getAsn.recordset?.[0]
  if (!asnRow?.InboundAsnId) {
    console.error('InboundId=' + INBOUND_ID + ' için InboundAsn kaydı bulunamadı.')
    process.exit(1)
  }
  const inboundAsnId = asnRow.InboundAsnId
  console.log('InboundAsnId =', inboundAsnId)

  await sqlPool.request().input('InboundAsnId', sql.Int, inboundAsnId)
    .query('UPDATE dbo.InboundAsn SET AsnNo = NULL WHERE InboundAsnId = @InboundAsnId')
  console.log('InboundAsn.AsnNo = NULL yapıldı.')

  await sqlPool.request().input('SourceId', sql.Int, inboundAsnId)
    .query('DELETE FROM dbo.[Queue] WHERE SourceTypeId IN (1,2,3) AND SourceId = @SourceId')
  console.log('Eski kuyruk kaydı silindi (varsa).')

  await sqlPool.request().input('InboundAsnId', sql.Int, inboundAsnId).execute('dbo.CreateQueueForASN')
  console.log('CreateQueueForASN çalıştırıldı.')

  const getQueue = await sqlPool.request().input('SourceId', sql.Int, inboundAsnId)
    .query('SELECT TOP 1 QueueId, JsonData FROM dbo.[Queue] WHERE SourceTypeId IN (1,2,3) AND SourceId = @SourceId ORDER BY QueueId DESC')
  const queueRow = getQueue.recordset?.[0]
  if (!queueRow?.QueueId) {
    console.error('Yeni kuyruk kaydı oluşmadı. OrderAsnModel view güncel mi kontrol edin.')
    process.exit(1)
  }
  const queueId = queueRow.QueueId
  const jsonData = queueRow.JsonData != null ? String(queueRow.JsonData) : ''
  console.log('QueueId =', queueId)
  console.log('JsonData uzunluk:', jsonData.length)
  if (jsonData.length <= 500) {
    console.log('JsonData:', jsonData)
  } else {
    console.log('JsonData (ilk 400 char):', jsonData.slice(0, 400) + '...')
  }
  console.log('')

  const insLogReq = sqlPool.request()
  insLogReq.input('QueueId', sql.Int, queueId)
  insLogReq.output('QueueLogId', sql.Int)
  const insLogResult = await insLogReq.execute('dbo.InsertQueueLog')
  const queueLogId = insLogResult.output?.QueueLogId ?? insLogResult.recordset?.[0]?.QueueLogId
  if (!queueLogId) {
    console.error('QueueLog insert hatası')
    process.exit(1)
  }
  console.log('QueueLogId =', queueLogId)

  let token
  try {
    token = await getErpToken()
  } catch (err) {
    console.error('ERP token hatası:', err.message)
    process.exit(1)
  }
  const postPath = `/IntegratorService/Post/${encodeURIComponent(token)}`
  console.log('ERP POST gönderiliyor...')

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
    console.log('ERP yanıtı:', success ? 'Success' : 'Hata/Success değil')
    if (responseText.length <= 600) {
      console.log(responseText)
    } else {
      console.log(responseText.slice(0, 600) + '...')
    }
  } catch (e) {
    errMsg = e.message || String(e)
    console.log('ERP hata:', errMsg)
  }

  await sqlPool.request()
    .input('QueueLogId', sql.Int, queueLogId)
    .input('IsSuccess', sql.Bit, success ? 1 : 0)
    .execute('dbo.UpdateQueueLog')

  await sqlPool.request()
    .input('QueueLogId', sql.Int, queueLogId)
    .input('QueueId', sql.Int, queueId)
    .input('DetailType', sql.NVarChar(50), 'Post')
    .input('Response', sql.NVarChar(sql.MAX), responseText || '')
    .input('ExceptionMessage', sql.NVarChar(sql.MAX), errMsg || '')
    .input('IsSuccess', sql.Bit, success ? 1 : 0)
    .execute('dbo.InsertQueueLogDetail')

  if (success) {
    await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnSuccess')
    const asnNo = (() => {
      try {
        const p = JSON.parse(responseText || '{}')
        return p?.OrderAsnNumber ?? p?.orderAsnNumber ?? p?.AsnNo ?? p?.asnNo ?? p?.DocumentNo ?? p?.documentNo
      } catch (_) { return null }
    })()
    if (asnNo != null && String(asnNo).trim() !== '') {
      await sqlPool.request()
        .input('InboundAsnId', sql.Int, inboundAsnId)
        .input('AsnNo', sql.NVarChar(50), String(asnNo).trim())
        .query('UPDATE dbo.InboundAsn SET AsnNo = @AsnNo, CompletedDate = GETDATE() WHERE InboundAsnId = @InboundAsnId')
      console.log('\nInboundAsn.AsnNo güncellendi:', String(asnNo).trim())
    }
    console.log('\nSonuç: Başarılı. IsCompleted=1.')
  } else {
    await sqlPool.request().input('QueueId', sql.Int, queueId).execute('dbo.UpdateQueueOnFailure')
    console.log('\nSonuç: Hata. TryCount artırıldı.')
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
