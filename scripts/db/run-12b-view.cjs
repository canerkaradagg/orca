const path = require('path')
const fs = require('fs')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('../../dist/scripts/db/connection-pool')
const content = fs.readFileSync(path.join(root, 'db/scripts/12b_View_OrderAsnModel.sql'), 'utf8')
const batches = content.split(/\s*GO\s*/i).map((b) => b.trim()).filter((b) => b.length > 0 && !b.startsWith('USE '))

async function main() {
  const pool = await getPool().getPool()
  for (const batch of batches) {
    await pool.request().query(batch.replace(/\u2019/g, "'"))
  }
  console.log('12b_View_OrderAsnModel guncellendi.')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
