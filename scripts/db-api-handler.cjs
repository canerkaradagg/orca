/**
 * ORCA ASN Portalı – API Route Handler (modular)
 * Route'lar scripts/api/routes/ altındaki modüllerden yüklenir.
 */

;(function loadEnv() {
  const dotenv = require('dotenv')
  const path   = require('path')
  const root   = path.resolve(__dirname, '..')
  dotenv.config({ path: path.join(root, '.env') })
  if (!process.env.ERP_INTEGRATOR_PASSWORD) {
    dotenv.config({ path: path.join(root, '.env.example') })
  }
})()

const { Router } = require('./api/router.cjs')
const { sendError } = require('./api/middleware.cjs')

const router = new Router()

require('./api/routes/auth.cjs').register(router)
require('./api/routes/admin.cjs').register(router)
require('./api/routes/parameters.cjs').register(router)
require('./api/routes/exception-store.cjs').register(router)
require('./api/routes/master-data.cjs').register(router)
require('./api/routes/inbound.cjs').register(router)
require('./api/routes/queue.cjs').register(router)
require('./api/routes/maintenance.cjs').register(router)
require('./api/routes/finance.cjs').register(router)
require('./api/routes/picking-list.cjs').register(router)
require('./api/routes/report.cjs').register(router)

async function handleApiRequest(req, res) {
  const handled = await router.handle(req, res)
  if (!handled) {
    sendError(res, 404, 'Not found')
  }
}

module.exports = { handleApiRequest }
