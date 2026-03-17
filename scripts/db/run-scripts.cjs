/**
 * OrcaAlokasyon DB scriptlerini sırayla çalıştırır.
 * Kullanım: node scripts/db/run-scripts.cjs
 * .env içinde DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD tanımlı olmalı (veya varsayılanlar kullanılır).
 */

const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
if (!process.env.DB_SERVER && !process.env.DB_NAME) {
  try { require('dotenv').config({ path: path.join(root, '.env.example') }) } catch {}
}

const { getPool } = require('./connection-pool.cjs')

const SCRIPTS_DIR = path.join(root, 'db', 'scripts')

const SCRIPT_ORDER = [
  '01_Schemas.sql',
  '02_Tables_Portal.sql',
  '02a_Tables_AsnRef.sql',
  '03_Tables_Allocation.sql',
  '04_Tables_Master.sql',
  '04c_Seed_Company.sql',
  // WarehouseCodes, AllocationExcludedWarehouse vb. placeholder view'lar
  // 04b_Tables_ExtSync içindeki ext.OrderHeader view'ında kullanılmadan önce oluşturulmalı.
  '05_Views.sql',
  '04b_Tables_ExtSync.sql',
  '06_Indexes.sql',
  '07_ErrorLog.sql',
  '08_CreateRequest.sql',
  '08a_AsnRef_Procedures.sql',
  '09_UpdateChannelTemplate.sql',
  '10_Allocation.sql',
  '11_Tables_Queue.sql',
  '11c_Table_Priority.sql',
  '11b_Table_ProcessCodes.sql',
  '12a_View_DraftOrder.sql',
  '12b_View_OrderAsnModel.sql',
  '12_Views_List.sql',
  '13_CreateQueueForAllocation.sql',
  '14_CreateQueueForASN.sql',
  '15_QueueProcess.sql',
  '15a_InsertOrdersReservationsDispOrders.sql',
  '15c_SetDispOrderLock_CancelReceivedOrder.sql',
  '15d_MissionAccomplished_Helpers.sql',
  '15b_MissionAccomplished.sql',
  '16_Table_SystemParameter.sql',
  '17_CleanupDraftOrderWhenRequestComplete.sql',
  '18_DropIsQuarantine.sql',
  '19_Tables_Auth.sql',
  '20_Tables_Finance.sql',
  '21_Views_Finance.sql',
  '22_PatchQueueDispOrderModel83.sql',
  '23_SyncDispOrderFromErp.sql',
  '23a_UpdateDispOrderHeaderCategorySeason.sql',
  // 24a_EnableChangeTracking_ERP.sql – ERP veritabanlarında (OlkaV3, MARLINV3 vb.) çalıştırılır; OrcaAlokasyon deploy'unda atlanır. Gerekirse ERP sunucusunda manuel çalıştırın.
  '24_ChangeTrack_UpdateReplenishment.sql',
  '24b_DropItemDim3Code.sql',
  '25_DropOneTimeSPs.sql',
  '08_CreateRequest.sql',
  '10_Allocation.sql',
  '14_CreateQueueForASN.sql',
]

function splitBatches(content) {
  return content
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
}

// SET batch'leri CREATE PROCEDURE ile birleştirme (CREATE must be first in batch)
function mergeSetBatches(batches) {
  return batches
}

async function runScript(pool, filePath) {
  const name = path.basename(filePath)
  const content = fs.readFileSync(filePath, 'utf8')
  let batches = splitBatches(content)
  batches = mergeSetBatches(batches)
  for (let i = 0; i < batches.length; i++) {
    let batch = batches[i]
    if (!batch) continue
    // SQL Server sadece ASCII tek tırnak (') kabul eder; Unicode tırnak (') batch'te hataya yol açar
    batch = batch.replace(/\u2019/g, "'")
    try {
      await pool.request().query(batch)
    } catch (err) {
      console.error(`[run-scripts] Hata: ${name} (batch ${i + 1}):`, err.message)
      throw err
    }
  }
  console.log('[run-scripts] OK:', name)
}

const MIGRATION_SCRIPT = '00_MigrationHistory.sql'

async function isAlreadyApplied(pool, scriptName) {
  const result = await pool
    .request()
    .input('name', scriptName)
    .query('SELECT 1 FROM dbo._MigrationHistory WHERE ScriptName = @name')
  return result.recordset.length > 0
}

async function recordMigration(pool, scriptName) {
  await pool
    .request()
    .input('name', scriptName)
    .query('INSERT INTO dbo._MigrationHistory (ScriptName) VALUES (@name)')
}

async function main() {
  console.log('[run-scripts] Hedef:', SCRIPTS_DIR)
  const pool = await getPool().getPool()

  // Always run the migration-history bootstrap script first (unconditionally)
  const migrationPath = path.join(SCRIPTS_DIR, MIGRATION_SCRIPT)
  if (fs.existsSync(migrationPath)) {
    await runScript(pool, migrationPath)
  } else {
    console.warn('[run-scripts] Migration tablosu scripti bulunamadı:', MIGRATION_SCRIPT)
  }

  for (const fileName of SCRIPT_ORDER) {
    const filePath = path.join(SCRIPTS_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      console.warn('[run-scripts] Atlandı (dosya yok):', fileName)
      continue
    }
    if (await isAlreadyApplied(pool, fileName)) {
      console.log('[run-scripts] SKIP (already applied):', fileName)
      continue
    }
    await runScript(pool, filePath)
    await recordMigration(pool, fileName)
  }
  console.log('[run-scripts] Tüm scriptler tamamlandı.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[run-scripts] Fatal:', err.message)
  process.exit(1)
})
