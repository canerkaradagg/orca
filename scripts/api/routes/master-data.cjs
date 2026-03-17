const { getPool } = require('../../db/connection-pool.cjs')
const { getQueryParams, sendOk, wrapHandler } = require('../middleware.cjs')
const { resolveCompanyKey } = require('../helpers.cjs')

function register(router) {
  router.get('/api/companies', wrapHandler(async (req, res) => {
    const pool = getPool()
    const stmt = pool.getPreparedStatement(
      'SELECT CompanyCode AS companyCode, CompanyName AS companyName FROM dbo.cdCompany ORDER BY CompanyCode', 'read')
    const rows = await stmt.all()
    sendOk(res, { rows: rows.map(r => ({ companyCode: String(r.companyCode ?? ''), companyName: String(r.companyName ?? '') })) })
  }))

  router.get('/api/warehouses', wrapHandler(async (req, res) => {
    const company = (getQueryParams(req.url).company || '').trim()
    if (!company) return sendOk(res, { rows: [] })
    const pool = getPool()
    const key  = await resolveCompanyKey(pool, company)
    const stmt = pool.getPreparedStatement(
      `SELECT WarehouseCode AS code, WarehouseDescription AS description, IsDefault AS isDefault FROM dbo.cdWarehouse WHERE (LTRIM(RTRIM(CAST(Company AS NVARCHAR(100)))) = LTRIM(RTRIM(?)) OR Company = ?) AND IsBlocked = 0 ORDER BY IsDefault DESC, WarehouseCode`, 'read')
    const rows = await stmt.all(key, key)
    sendOk(res, { rows: rows.map(r => ({ code: String(r.code ?? ''), description: String(r.description ?? ''), isDefault: Boolean(r.isDefault) })) })
  }))

  router.get('/api/vendors', wrapHandler(async (req, res) => {
    const company = (getQueryParams(req.url).company || '').trim()
    if (!company) return sendOk(res, { rows: [] })
    const pool = getPool()
    const key  = await resolveCompanyKey(pool, company)
    const stmt = pool.getPreparedStatement(
      `SELECT CurrAccCode AS code, CurrAccDescription AS description FROM dbo.Vendor WHERE (LTRIM(RTRIM(CAST(Company AS NVARCHAR(100)))) = LTRIM(RTRIM(?)) OR Company = ?) AND IsBlocked = 0 ORDER BY CurrAccCode`, 'read')
    const rows = await stmt.all(key, key)
    sendOk(res, { rows: rows.map(r => ({ code: String(r.code ?? ''), description: String(r.description ?? '') })) })
  }))

  router.get('/api/channel-templates', wrapHandler(async (req, res) => {
    const company = (getQueryParams(req.url).company || '').trim()
    if (!company) return sendOk(res, { rows: [] })
    const pool = getPool()
    const key  = await resolveCompanyKey(pool, company)
    const stmt = pool.getPreparedStatement(
      `SELECT ChannelTemplateCode AS code, ChannelTemplateCode AS description FROM dbo.ChannelTemplate WHERE (LTRIM(RTRIM(CAST(Company AS NVARCHAR(100)))) = LTRIM(RTRIM(?)) OR Company = ?) AND ForAllocation = 1 AND IsBlocked = 0 ORDER BY ChannelTemplateCode`, 'read')
    const rows = await stmt.all(key, key)
    sendOk(res, { rows: rows.map(r => ({ code: String(r.code ?? ''), description: String(r.description ?? '') })) })
  }))
}

module.exports = { register }
