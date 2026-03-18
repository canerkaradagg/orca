const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()
  const r = await pool.request().query(`
    SELECT 
      OBJECT_SCHEMA_NAME(referencing_id) AS ref_schema,
      OBJECT_NAME(referencing_id) AS ref_name,
      o.type_desc AS ref_type
    FROM sys.sql_expression_dependencies d
    INNER JOIN sys.objects o ON o.object_id = d.referencing_id
    WHERE d.referenced_entity_name = 'InboundAsn'
    UNION ALL
    SELECT 
      OBJECT_SCHEMA_NAME(referencing_id),
      OBJECT_NAME(referencing_id),
      o.type_desc
    FROM sys.dm_sql_referencing_entities('dbo.InboundAsn', 'OBJECT') e
    INNER JOIN sys.objects o ON o.object_id = e.referencing_id
  `)
  console.log('InboundAsn referansları:', r.recordset || [])
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
