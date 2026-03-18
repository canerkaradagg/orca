const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()
  const r = await pool.request().query(`
    SELECT dc.name AS constraint_name, dc.type_desc
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.InboundAsn') AND c.name = 'IsQuarantine'
  `)
  console.log('Default constraints on IsQuarantine:', r.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
