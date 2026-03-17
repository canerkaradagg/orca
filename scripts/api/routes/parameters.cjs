const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { readBody, sendOk, sendError, wrapHandler } = require('../middleware.cjs')

function register(router) {
  router.get('/api/parameters', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(
      'SELECT ParameterKey AS parameterKey, ParameterValue AS parameterValue, Description AS description, UpdatedAt AS updatedAt, UpdatedBy AS updatedBy FROM dbo.SystemParameter ORDER BY ParameterKey'
    )
    const rows = (result.recordset || []).map(r => ({
      parameterKey: String(r.parameterKey ?? ''),
      parameterValue: r.parameterValue != null ? String(r.parameterValue) : '',
      description: r.description != null ? String(r.description) : '',
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy != null ? String(r.updatedBy) : null,
    }))
    sendOk(res, { parameters: rows })
  }))

  router.put('/api/parameters', wrapHandler(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const list = Array.isArray(body.parameters)
      ? body.parameters
      : (body.parameterKey != null ? [{ parameterKey: body.parameterKey, parameterValue: body.parameterValue }] : [])
    if (list.length === 0) return sendError(res, 400, 'parameters array or parameterKey/parameterValue required')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const updatedBy = (body.updatedBy != null && String(body.updatedBy).trim()) ? String(body.updatedBy).trim() : null
    for (const item of list) {
      const key = (item.parameterKey ?? item.key ?? '').toString().trim()
      const val = (item.parameterValue ?? item.value ?? '').toString()
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
  }))
}

module.exports = { register }
