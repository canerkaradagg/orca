/**
 * ORCA – JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken')
const { getPool } = require('../db/connection-pool.cjs')
const sql = require('mssql')

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET tanımlı değil – .env dosyasını kontrol edin.')
  return secret
}

const TOKEN_TTL_INTERNAL = '8h'
const TOKEN_TTL_EXTERNAL = '24h'

function signToken(payload, isExternal = false) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: isExternal ? TOKEN_TTL_EXTERNAL : TOKEN_TTL_INTERNAL })
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret())
}

function extractToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

async function loadUserPermissions(userId) {
  const pool = getPool()
  const sqlPool = await pool.getPool()
  const result = await sqlPool.request()
    .input('UserId', sql.Int, userId)
    .query(`
      SELECT s.ScreenCode, rsp.CanView, rsp.CanEdit, rsp.CanDelete
      FROM dbo.RoleScreenPermissions rsp
      JOIN dbo.UserRoles ur ON ur.RoleId = rsp.RoleId
      JOIN dbo.Screens s   ON s.ScreenId = rsp.ScreenId
      WHERE ur.UserId = @UserId
    `)
  const perms = {}
  for (const row of result.recordset || []) {
    const code = row.ScreenCode
    if (!perms[code]) perms[code] = { canView: false, canEdit: false, canDelete: false }
    if (row.CanView)   perms[code].canView = true
    if (row.CanEdit)   perms[code].canEdit = true
    if (row.CanDelete) perms[code].canDelete = true
  }
  return perms
}

function requireAuth(handlerFn) {
  return async (req, res, params) => {
    const token = extractToken(req)
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Token gerekli.' }))
      return
    }
    try {
      const decoded = verifyToken(token)
      req.user = decoded
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token süresi dolmuş.' : 'Geçersiz token.'
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: msg }))
      return
    }
    await handlerFn(req, res, params)
  }
}

function requireScreen(screenCode, permission = 'canView') {
  return (handlerFn) => {
    return requireAuth(async (req, res, params) => {
      const perms = await loadUserPermissions(req.user.userId)
      const screenPerm = perms[screenCode]
      if (!screenPerm || !screenPerm[permission]) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Bu ekrana erişim yetkiniz yok.' }))
        return
      }
      req.user.permissions = perms
      await handlerFn(req, res, params)
    })
  }
}

module.exports = {
  signToken,
  verifyToken,
  extractToken,
  loadUserPermissions,
  requireAuth,
  requireScreen,
  TOKEN_TTL_INTERNAL,
  TOKEN_TTL_EXTERNAL,
}
