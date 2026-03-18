/**
 * Sadece kuyruk scriptlerini (11, 13, 14) çalıştırır.
 * Kullanım: node scripts/db/run-queue-scripts.cjs
 */

const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })

const { getPool } = require('../../dist/scripts/db/connection-pool')

const SCRIPTS_DIR = path.join(root, 'db', 'scripts')
const TO_RUN = ['11_Tables_Queue.sql', '11c_Table_Priority.sql', '11b_Table_ProcessCodes.sql', '12a_View_DraftOrder.sql', '12b_View_OrderAsnModel.sql', '13_CreateQueueForAllocation.sql', '14_CreateQueueForASN.sql', '15_QueueProcess.sql', '15a_InsertOrdersReservationsDispOrders.sql', '15c_SetDispOrderLock_CancelReceivedOrder.sql', '15d_MissionAccomplished_Helpers.sql', '15b_MissionAccomplished.sql']

function splitBatches(content) {
  return content
    .split(/\s*GO\s*/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
}

async function runScript(pool, filePath) {
  const name = path.basename(filePath)
  const content = fs.readFileSync(filePath, 'utf8')
  const batches = splitBatches(content)
  for (let i = 0; i < batches.length; i++) {
    let batch = batches[i].replace(/\u2019/g, "'")
    if (!batch) continue
    await pool.request().query(batch)
  }
  console.log('[run-queue-scripts] OK:', name)
}

async function main() {
  console.log('[run-queue-scripts] Hedef:', SCRIPTS_DIR)
  const pool = await getPool().getPool()
  for (const fileName of TO_RUN) {
    const filePath = path.join(SCRIPTS_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      console.warn('[run-queue-scripts] Atlandı (dosya yok):', fileName)
      continue
    }
    await runScript(pool, filePath)
  }
  console.log('[run-queue-scripts] Kuyruk scriptleri tamamlandı.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[run-queue-scripts] Hata:', err.message)
  process.exit(1)
})
