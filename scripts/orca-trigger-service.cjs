/**
 * ORCA Tetikleyici Servisi – Zamanlanmış işleri API üzerinden çalıştırır.
 * Windows Service olarak çalıştırılabilir (NSSM veya node-windows ile).
 * Önce local, sonra sunucuya kurulur.
 *
 * Kullanım: node scripts/orca-trigger-service.cjs
 * Ortam: ORCA_API_BASE (örn. http://localhost:3001) – varsayılan http://localhost:3001
 * Ortam: INTERNAL_SERVICE_API_KEY – API'de tanımlı olmalı; bu key ile queue/maintenance/parameters erişilir.
 *
 * Parametreler (çalışma sıklığı vb.) API'den GET /api/parameters ile okunur.
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path = require('path')
  const root = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
})()

const API_BASE = (process.env.ORCA_API_BASE || 'http://localhost:3001').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_API_KEY || ''

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (INTERNAL_KEY) h['X-Internal-API-Key'] = INTERNAL_KEY
  return h
}

function log(msg) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${msg}`)
}

function parseMinutes(paramValue, defaultMinutes) {
  if (paramValue == null || paramValue === '') return defaultMinutes
  const n = parseInt(String(paramValue), 10)
  return Number.isFinite(n) && n > 0 ? n : defaultMinutes
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...getAuthHeaders(), ...options.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, error: text }
  }
}

async function getParameters() {
  try {
    const data = await fetchJson(`${API_BASE}/api/parameters`)
    if (!data.ok || !Array.isArray(data.parameters)) return null
    const map = {}
    for (const p of data.parameters) {
      map[p.parameterKey || p.key] = p.parameterValue != null ? String(p.parameterValue) : ''
    }
    return map
  } catch (err) {
    log('Parametreler alınamadı: ' + err.message)
    return null
  }
}

async function post(endpoint) {
  try {
    const data = await fetchJson(`${API_BASE}${endpoint}`, { method: 'POST' })
    log(`${endpoint} → ok: ${data.ok}`)
    return data
  } catch (err) {
    log(`${endpoint} hata: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

const JOBS = [
  { key: 'QueueProcessIntervalMinutes', endpoint: '/api/queue/process', defaultMinutes: 1 },
  { key: 'DraftCleanupIntervalMinutes', endpoint: '/api/maintenance/draft-cleanup', defaultMinutes: 1440 },
  { key: 'LogCleanupIntervalMinutes', endpoint: '/api/maintenance/log-cleanup', defaultMinutes: 1440 },
  { key: 'MaintenanceRunIntervalMinutes', endpoint: '/api/maintenance/run-report', defaultMinutes: 1440 },
  { key: 'UpdateReplenishmentIntervalMinutes', endpoint: '/api/maintenance/run-replenishment', defaultMinutes: 60 },
  { key: 'SyncDispOrderFromErpIntervalMinutes', endpoint: '/api/maintenance/sync-disp-order', defaultMinutes: 0 },
  { key: 'UpdateDispOrderHeaderCategorySeasonIntervalMinutes', endpoint: '/api/maintenance/update-disp-order-header-category-season', defaultMinutes: 0 },
]

const lastRun = {}
for (const j of JOBS) lastRun[j.endpoint] = 0

async function tick(params) {
  const now = Date.now()
  for (const job of JOBS) {
    const intervalMinutes = params ? parseMinutes(params[job.key], job.defaultMinutes) : job.defaultMinutes
    if (intervalMinutes <= 0) continue
    const intervalMs = Math.max(60000, intervalMinutes * 60 * 1000)
    if (now - lastRun[job.endpoint] >= intervalMs) {
      lastRun[job.endpoint] = now
      log('Job: ' + job.endpoint)
      await post(job.endpoint)
    }
  }
}

async function main() {
  log('ORCA Tetikleyici Servisi başlatıldı. API: ' + API_BASE)

  let params = await getParameters()
  let paramRefreshAt = Date.now()
  const PARAM_REFRESH_MS = 5 * 60 * 1000

  setInterval(async () => {
    if (Date.now() - paramRefreshAt >= PARAM_REFRESH_MS) {
      const p = await getParameters()
      if (p) { params = p; paramRefreshAt = Date.now() }
    }
    await tick(params)
  }, 60 * 1000)

  setTimeout(async () => {
    log('İlk queue process tetikleniyor.')
    await post('/api/queue/process')
  }, 5000)
}

main().catch(err => {
  log('Başlatma hatası: ' + err.message)
  process.exit(1)
})
