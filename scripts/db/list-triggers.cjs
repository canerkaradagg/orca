const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('./connection-pool.cjs')

async function main() {
  const pool = await getPool().getPool()
  const r = await pool.request().query(`
    SELECT t.name AS trigger_name, OBJECT_NAME(t.parent_id) AS table_name
    FROM sys.triggers t
    WHERE t.parent_id = OBJECT_ID('dbo.InboundAsn')
  `)
  console.log('Triggers on InboundAsn:', r.recordset || [])
  const r2 = await pool.request().query(`
    SELECT o.name, o.type_desc
    FROM sys.sql_expression_dependencies d
    INNER JOIN sys.objects o ON o.object_id = d.referencing_id
    WHERE d.referenced_id = OBJECT_ID('dbo.InboundAsn')
  `)
  console.log('All objects referencing InboundAsn:', r2.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
