import { getPool } from '../../db/connection-pool'
import sql from 'mssql'
import { sendOk, wrapHandler } from '../middleware'
import { requireAuthOrInternalKey } from '../auth-middleware'
import { getReportEmail, runMaintenanceReport, sendReportByEmail } from '../../shared/maintenance-report'
import type { Router } from '../router'

export function register(router: Router): void {
  router.post('/api/maintenance/draft-cleanup', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.CleanupDraftOrderAllCompletedAsns')
    sendOk(res)
  })))

  router.post('/api/maintenance/log-cleanup', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.QueueLogCleanup')
    sendOk(res)
  })))

  router.post('/api/maintenance/run-report', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const report = await runMaintenanceReport(sqlPool)
    const to = await getReportEmail(sqlPool)
    const { sent, error } = await sendReportByEmail(to, report)
    sendOk(res, { sent, to, error: error || null })
  })))

  router.post('/api/maintenance/run-replenishment', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.UpdateReplenishment')
    sendOk(res)
  })))

  router.post('/api/maintenance/sync-disp-order', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().execute('dbo.SyncDispOrderFromErp')
    sendOk(res)
  })))

  router.post('/api/maintenance/update-disp-order-header-category-season', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    let maxRows: number | null = null
    try {
      const r = await sqlPool.request().query(
        "SELECT ParameterValue FROM dbo.SystemParameter WHERE ParameterKey = N'UpdateDispOrderHeaderCategorySeasonMaxRows'"
      )
      const val = (r.recordset as Record<string, unknown>[])?.[0]?.ParameterValue
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
  })))
}
