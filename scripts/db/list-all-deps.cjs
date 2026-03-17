const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('./connection-pool.cjs')

async function main() {
  const pool = await getPool().getPool()
  const r = await pool.request().query(`
    SELECT OBJECT_NAME(referencing_id) AS ref_name, o.type_desc
    FROM sys.sql_expression_dependencies d
    INNER JOIN sys.objects o ON o.object_id = d.referencing_id
    WHERE d.referenced_id = OBJECT_ID('dbo.InboundAsn')
    ORDER BY o.type_desc, ref_name
  `)
  console.log('All referencing InboundAsn:', r.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
