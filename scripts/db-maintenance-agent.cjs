/**
 * ORCA ASN Portalı – Günlük bakım agent
 * Kullanım: node scripts/db-maintenance-agent.cjs
 * E-posta için .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Alıcı: dbo.SystemParameter.MaintenanceReportEmail (varsayılan: caner.karadag@olka.com.tr)
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path = require('path')
  const root = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.DB_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

const fs = require('fs')
const path = require('path')
const { getPool } = require('./db/connection-pool.cjs')
const { getReportEmail, runMaintenanceReport, sendReportByEmail } = require('./shared/maintenance-report.cjs')

const LOG_DIR = path.join(process.cwd(), 'logs')

async function main() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

  const pool = getPool()
  let sqlPool
  try {
    sqlPool = await pool.getPool()
  } catch (err) {
    console.error('[maintenance] DB bağlantı hatası:', err.message)
    process.exit(1)
  }

  const report = await runMaintenanceReport(sqlPool)
  const dateStr = new Date().toISOString().slice(0, 10)
  const logPath = path.join(LOG_DIR, `maintenance-${dateStr}.txt`)
  fs.writeFileSync(logPath, report, 'utf8')
  console.log('[maintenance] Rapor dosyaya yazıldı:', logPath)

  const to = await getReportEmail(sqlPool)
  const { sent, error } = await sendReportByEmail(to, report)
  if (sent) {
    console.log('[maintenance] Rapor e-posta ile gönderildi:', to)
  } else {
    console.log('[maintenance] E-posta gönderilemedi:', error || 'SMTP ayarlarını kontrol edin.')
  }

  process.exit(0)
}

main().catch(err => {
  console.error('[maintenance]', err)
  process.exit(1)
})
