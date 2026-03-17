/**
 * Bakım raporunu API üzerinden tetikler (rapor oluşturulur, e-posta SMTP ayarlıysa gönderilir).
 * OrcaApi çalışıyor olmalı. Kullanım: node scripts/trigger-maintenance-report.cjs
 */

const path = require('path')
require('dotenv').config({ path: path.join(path.resolve(__dirname, '..'), '.env') })

const API_BASE = (process.env.ORCA_API_BASE || process.env.API_PORT ? `http://localhost:${process.env.API_PORT}` : 'http://localhost:3001').replace(/\/$/, '')

async function main() {
  console.log('Bakım raporu tetikleniyor:', API_BASE + '/api/maintenance/run-report')
  try {
    const res = await fetch(API_BASE + '/api/maintenance/run-report', { method: 'POST' })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { ok: false, error: text } }
    if (!res.ok) {
      console.error('Hata:', res.status, data.error || text)
      process.exit(1)
    }
    console.log('Rapor oluşturuldu.')
    if (data.sent) console.log('E-posta gönderildi:', data.to)
    else if (data.error) console.log('E-posta gönderilemedi:', data.error)
  } catch (err) {
    console.error('İstek hatası:', err.message)
    process.exit(1)
  }
}

main()
