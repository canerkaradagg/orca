require('dotenv').config()
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()
  const scripts = [
    '15_QueueProcess.sql',
    '12a_View_DraftOrder.sql',
    '18_DropIsQuarantine.sql'
  ]
  const list = scripts.map(s => `'${s}'`).join(',')
  const r = await pool.request().query(
    `DELETE FROM dbo._MigrationHistory WHERE ScriptName IN (${list}); SELECT @@ROWCOUNT AS deleted`
  )
  console.log('Migration kayıtları silindi:', r.recordset[0].deleted)
  process.exit(0)
}

main().catch(err => { console.error(err.message); process.exit(1) })
