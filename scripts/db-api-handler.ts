/**
 * ORCA ASN Portalı – API Route Handler (modular)
 */

import dotenv from 'dotenv'
import path from 'path'
import { getProjectRoot } from './lib/project-root'
import { Router } from './api/router'
import { sendError } from './api/middleware'
import { createMiddleware } from './api/rate-limiter'
import { register as registerAuth } from './api/routes/auth'
import { register as registerAdmin } from './api/routes/admin'
import { register as registerParameters } from './api/routes/parameters'
import { register as registerExceptionStore } from './api/routes/exception-store'
import { register as registerMasterData } from './api/routes/master-data'
import { register as registerInbound } from './api/routes/inbound'
import { register as registerQueue } from './api/routes/queue'
import { register as registerMaintenance } from './api/routes/maintenance'
import { register as registerFinance } from './api/routes/finance'
import { register as registerPickingList } from './api/routes/picking-list'
import { register as registerReport } from './api/routes/report'
import type { IncomingMessage, ServerResponse } from 'http'

;(function loadEnv() {
  const root = getProjectRoot()
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.ERP_INTEGRATOR_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

const router = new Router()

const globalRateLimit = createMiddleware({
  windowMs: 60 * 1000,
  max: 100,
  getKey: (req) => req.socket?.remoteAddress || 'unknown',
  skipWhen: (req) => {
    const key = process.env.INTERNAL_SERVICE_API_KEY
    const provided = (req.headers?.['x-internal-api-key'] as string) || (req.headers?.['X-Internal-API-Key'] as string) || ''
    return !!(key && provided === key)
  },
})

registerAuth(router)
registerAdmin(router)
registerParameters(router)
registerExceptionStore(router)
registerMasterData(router)
registerInbound(router)
registerQueue(router)
registerMaintenance(router)
registerFinance(router)
registerPickingList(router)
registerReport(router)

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const runRouter = async (_req: IncomingMessage, _res: ServerResponse, _params: Record<string, string>) => {
    const handled = await router.handle(req, res)
    if (!handled) sendError(res, 404, 'Not found')
  }
  await globalRateLimit(runRouter)(req, res, {})
}
