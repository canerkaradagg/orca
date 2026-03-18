/**
 * Bakım raporunu veritabanından alıp konsola yazar (e-posta yok).
 * Kullanım: node scripts/show-maintenance-report.cjs
 */

const path = require('path')
const root = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(root, '.env') })

const { getPool } = require('../dist/scripts/db/connection-pool')
const { runMaintenanceReport } = require('../dist/scripts/shared/maintenance-report')

async function main() {
  const pool = getPool()
  const sqlPool = await pool.getPool()
  const report = await runMaintenanceReport(sqlPool)
  console.log(report)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
