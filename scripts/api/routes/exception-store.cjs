const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { readBody, sendOk, sendError, wrapHandler } = require('../middleware.cjs')

function register(router) {
  router.get('/api/exception-store-list', wrapHandler(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(
      'SELECT CurrAccTypeCode AS currAccTypeCode, CurrAccCode AS currAccCode FROM dbo.ExceptionStore ORDER BY CurrAccTypeCode, CurrAccCode'
    )
    const items = (result.recordset || []).map(r => ({
      currAccTypeCode: r.currAccTypeCode != null ? Number(r.currAccTypeCode) : 0,
      currAccCode: r.currAccCode != null ? String(r.currAccCode).trim() : '',
    }))
    sendOk(res, { items })
  }))

  router.put('/api/exception-store-list', wrapHandler(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const raw = Array.isArray(body.items) ? body.items : []
    const items = raw
      .map(i => ({
        currAccTypeCode: i.currAccTypeCode != null ? parseInt(i.currAccTypeCode, 10) : 0,
        currAccCode: (i.currAccCode != null ? String(i.currAccCode).trim() : ''),
      }))
      .filter(i => !Number.isNaN(i.currAccTypeCode) && i.currAccCode !== '')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().query('DELETE FROM dbo.ExceptionStore')
    for (const it of items) {
      const reqIns = sqlPool.request()
      reqIns.input('CurrAccTypeCode', sql.TinyInt, it.currAccTypeCode)
      reqIns.input('CurrAccCode', sql.NVarChar(30), it.currAccCode)
      await reqIns.query('INSERT INTO dbo.ExceptionStore (CurrAccTypeCode, CurrAccCode) VALUES (@CurrAccTypeCode, @CurrAccCode)')
    }
    sendOk(res, { count: items.length })
  }))
}

module.exports = { register }
