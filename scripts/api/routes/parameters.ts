import { getPool } from '../../db/connection-pool'
import sql from 'mssql'
import { sendOk, wrapHandler, validateBody } from '../middleware'
import { putParametersSchema } from '../validators/parameters'
import { requireScreen, requireAuthOrInternalKey } from '../auth-middleware'
import type { Router } from '../router'

export function register(router: Router): void {
  router.get('/api/parameters', wrapHandler(requireAuthOrInternalKey(async (_req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(
      'SELECT ParameterKey AS parameterKey, ParameterValue AS parameterValue, Description AS description, UpdatedAt AS updatedAt, UpdatedBy AS updatedBy FROM dbo.SystemParameter ORDER BY ParameterKey'
    )
    const rows = (result.recordset || []).map((r: Record<string, unknown>) => ({
      parameterKey: String(r.parameterKey ?? ''),
      parameterValue: r.parameterValue != null ? String(r.parameterValue) : '',
      description: r.description != null ? String(r.description) : '',
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy != null ? String(r.updatedBy) : null,
    }))
    sendOk(res, { parameters: rows })
  })))

  router.put('/api/parameters', wrapHandler(requireScreen('parametreler', 'canEdit')(validateBody(putParametersSchema)(async (req, res) => {
    const body = (req as { body: Record<string, unknown> }).body
    const list = Array.isArray(body.parameters)
      ? body.parameters
      : (body.parameterKey != null ? [{ parameterKey: body.parameterKey, parameterValue: body.parameterValue }] : [])
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const updatedBy = (body.updatedBy != null && String(body.updatedBy).trim()) ? String(body.updatedBy).trim() : null
    for (const item of list) {
      const it = item as Record<string, unknown>
      const key = (it.parameterKey ?? it.key ?? '').toString().trim()
      const val = (it.parameterValue ?? it.value ?? '').toString()
      if (!key) continue
      const reqUp = sqlPool.request()
      reqUp.input('Key', sql.NVarChar(100), key)
      reqUp.input('Value', sql.NVarChar(500), val)
      reqUp.input('By', sql.NVarChar(100), updatedBy)
      await reqUp.query(`
        IF EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = @Key)
          UPDATE dbo.SystemParameter SET ParameterValue = @Value, UpdatedAt = GETDATE(), UpdatedBy = @By WHERE ParameterKey = @Key
        ELSE
          INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, UpdatedAt, UpdatedBy) VALUES (@Key, @Value, GETDATE(), @By)
      `)
    }
    sendOk(res)
  }))))
}
