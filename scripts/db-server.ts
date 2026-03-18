/**
 * ORCA ASN Portalı – Standalone API Server (port 3001)
 */

import dotenv from 'dotenv'
import path from 'path'
import http from 'http'
import { getProjectRoot } from './lib/project-root'
import logger from './lib/logger'
import { handleApiRequest } from './db-api-handler'

;(function loadEnv() {
  const root = getProjectRoot()
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.DB_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

function main(): void {
  const PORT = Number(process.env.API_PORT) || 3001

  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const server = http.createServer(async (req, res) => {
    const origin = (req.headers.origin as string) || (req.headers.Origin as string) || ''
    const allowOrigin = corsOrigins.length === 0
      ? '*'
      : (origin && corsOrigins.includes(origin) ? origin : corsOrigins[0])
    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Internal-API-Key')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      await handleApiRequest(req, res)
    } catch (err) {
      logger.error({ err }, 'db-server unhandled error')
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(err) }))
      }
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} zaten kullanımda. API_PORT=farklı_port deneyin.`)
    } else {
      logger.error({ err }, 'Sunucu hatası')
    }
    process.exit(1)
  })

  server.listen(PORT, () => {
    logger.info({ port: PORT, db: process.env.DB_SERVER || 'localhost', dbName: process.env.DB_NAME || 'OrcaAlokasyon' }, 'ORCA API sunucusu başlatıldı')
  })
}

main()
