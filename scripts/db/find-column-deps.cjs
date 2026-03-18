const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()
  const objectId = await pool.request().query("SELECT OBJECT_ID('dbo.InboundAsn') AS id")
  const id = objectId.recordset[0].id
  const col = await pool.request().query("SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'IsQuarantine'")
  const colId = col.recordset[0]?.column_id
  if (!colId) {
    console.log('IsQuarantine column not found (already dropped?)')
    process.exit(0)
    return
  }
  const r = await pool.request().query(`
    SELECT OBJECT_NAME(referencing_id) AS ref_obj, referencing_class_desc
    FROM sys.sql_expression_dependencies
    WHERE referenced_id = ${id} AND referenced_minor_id = ${colId}
  `)
  console.log('Column IsQuarantine referencers:', r.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
