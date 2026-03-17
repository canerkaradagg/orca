const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { sendOk, wrapHandler } = require('../middleware.cjs')

function register(router) {
  router.post('/api/maintenance/draft-cleanup', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.CleanupDraftOrderAllCompletedAsns')
    sendOk(res)
  }))

  router.post('/api/maintenance/log-cleanup', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.QueueLogCleanup')
    sendOk(res)
  }))

  router.post('/api/maintenance/run-report', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const { getReportEmail, runMaintenanceReport, sendReportByEmail } = require('../../shared/maintenance-report.cjs')
    const report = await runMaintenanceReport(sqlPool)
    const to = await getReportEmail(sqlPool)
    const { sent, error } = await sendReportByEmail(to, report)
    sendOk(res, { sent, to, error: error || null })
  }))

  router.post('/api/maintenance/run-replenishment', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.UpdateReplenishment')
    sendOk(res)
  }))

  router.post('/api/maintenance/sync-disp-order', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.SyncDispOrderFromErp')
    sendOk(res)
  }))

  /** DispOrderHeader Category/Season/Brand toplu güncelleme (OrcaTrigger veya manuel). MaxRows parametre tablosundan okunur. */
  router.post('/api/maintenance/update-disp-order-header-category-season', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    let maxRows = null
    try {
      const r = await sqlPool.request().query(
        "SELECT ParameterValue FROM dbo.SystemParameter WHERE ParameterKey = N'UpdateDispOrderHeaderCategorySeasonMaxRows'"
      )
      const val = r.recordset?.[0]?.ParameterValue
      if (val != null && String(val).trim() !== '') {
        const n = parseInt(String(val).trim(), 10)
        if (Number.isFinite(n) && n > 0) maxRows = n
      }
    } catch (_) {}
    const request = sqlPool.request()
    request.input('DispOrderHeaderId', sql.Int, null)
    request.input('MaxRows', sql.Int, maxRows)
    await request.execute('dbo.UpdateDispOrderHeaderCategorySeason')
    sendOk(res)
  }))
}

module.exports = { register }
