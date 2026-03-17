const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('./connection-pool.cjs')

async function main() {
  const pool = await getPool().getPool()
  const r = await pool.request().query(`
    SELECT i.name AS index_name, c.name AS column_name
    FROM sys.index_columns ic
    INNER JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE ic.object_id = OBJECT_ID('dbo.InboundAsn') AND c.name = 'IsQuarantine'
  `)
  console.log('Indexes on IsQuarantine:', r.recordset || [])
  const r2 = await pool.request().query(`
    SELECT name FROM sys.statistics
    WHERE object_id = OBJECT_ID('dbo.InboundAsn')
  `)
  console.log('Statistics on InboundAsn:', r2.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
