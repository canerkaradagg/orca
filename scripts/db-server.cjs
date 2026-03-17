/**
 * ORCA ASN Portalı – Standalone API Server (port 3001)
 * Geliştirme: npm run db:serve
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path   = require('path')
  const root   = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.DB_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

function main() {
  const http = require('http')
  let handleApiRequest
  try {
    handleApiRequest = require('./db-api-handler.cjs').handleApiRequest
  } catch (err) {
    console.error('[db-server] Başlangıç hatası (route/modül yüklenirken):', err.message)
    console.error(err.stack)
    process.exit(1)
  }

  const PORT = process.env.API_PORT || 3001

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      await handleApiRequest(req, res)
    } catch (err) {
      console.error('[db-server] Unhandled error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(err) }))
      }
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[db-server] HATA: Port ${PORT} zaten kullanımda. Başka bir uygulama kapatın veya .env içinde API_PORT=farklı_port deneyin.`)
    } else {
      console.error('[db-server] Sunucu hatası:', err)
    }
    process.exit(1)
  })

  server.listen(PORT, () => {
    console.log(`[db-server] ORCA API sunucusu http://localhost:${PORT} adresinde çalışıyor.`)
    console.log(`[db-server] DB: ${process.env.DB_SERVER || 'localhost'} / ${process.env.DB_NAME || 'OrcaAlokasyon'}`)
  })
}

main()
