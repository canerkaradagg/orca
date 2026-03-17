const path = require('path')
const fs = require('fs')
const root = path.join(__dirname, '../..')
require('dotenv').config({ path: path.join(root, '.env') })
const { getPool } = require('./connection-pool.cjs')

const file = process.argv[2] || '18_DropIsQuarantine.sql'
const filePath = path.join(root, 'db', 'scripts', file)

function splitBatches(content) {
  return content.split(/\s*GO\s*/i).map(b => b.trim()).filter(Boolean)
}

async function main() {
  const content = fs.readFileSync(filePath, 'utf8')
  const batches = splitBatches(content)
  const pool = await getPool().getPool()
  for (let i = 0; i < batches.length; i++) {
    let batch = batches[i].replace(/\u2019/g, "'").replace(/\u2013/g, '-')
    await pool.request().query(batch)
    console.log('[run-one] Batch', i + 1, 'OK')
  }
  console.log('[run-one] Tamamlandi:', file)
  process.exit(0)
}
main().catch(e => {
  console.error('[run-one] Hata:', e.message)
  process.exit(1)
})
