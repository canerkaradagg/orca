const path = require('path')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('../../dist/scripts/db/connection-pool')

async function main() {
  const pool = await getPool().getPool()
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'IsQuarantine')
      ALTER TABLE dbo.InboundAsn DROP COLUMN IsQuarantine;
  `)
  console.log('IsQuarantine DROP COLUMN executed.')
  process.exit(0)
}
main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
