/**
 * ORCA – Auth Routes (login, me, refresh, change-password)
 */

const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const bcrypt = require('bcryptjs')
const { readBody, sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const { signToken, requireAuth, loadUserPermissions } = require('../auth-middleware.cjs')

const BCRYPT_ROUNDS = 12
const INITIAL_MARKER = '$INITIAL$'

function register(router) {

  /** DB kullanmadan API'nin ayakta olduğunu kontrol etmek için (npm run db:serve çalışıyor mu?) */
  router.get('/api/health', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'ORCA API çalışıyor' }))
  })

  router.post('/api/auth/login', wrapHandler(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const email = (body.email || '').toString().trim().toLowerCase()
    const password = (body.password || '').toString()
    if (!email || !password) return sendError(res, 400, 'Email ve şifre gerekli.')

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('Email', sql.NVarChar(200), email)
      .query('SELECT UserId, Email, DisplayName, PasswordHash, IsExternal, IsActive FROM dbo.Users WHERE LOWER(Email) = @Email')

    const user = result.recordset?.[0]
    if (!user || !user.IsActive) return sendError(res, 401, 'Geçersiz email veya şifre.')

    if (user.PasswordHash === INITIAL_MARKER) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      await sqlPool.request()
        .input('UserId', sql.Int, user.UserId)
        .input('Hash', sql.NVarChar(500), hash)
        .query('UPDATE dbo.Users SET PasswordHash = @Hash, LastLoginAt = GETDATE() WHERE UserId = @UserId')
    } else {
      const valid = await bcrypt.compare(password, user.PasswordHash)
      if (!valid) return sendError(res, 401, 'Geçersiz email veya şifre.')
      await sqlPool.request()
        .input('UserId', sql.Int, user.UserId)
        .query('UPDATE dbo.Users SET LastLoginAt = GETDATE() WHERE UserId = @UserId')
    }

    const rolesResult = await sqlPool.request()
      .input('UserId', sql.Int, user.UserId)
      .query('SELECT r.RoleId, r.RoleName FROM dbo.Roles r JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId WHERE ur.UserId = @UserId AND r.IsActive = 1')
    const roles = (rolesResult.recordset || []).map(r => ({ roleId: r.RoleId, roleName: r.RoleName }))

    const permissions = await loadUserPermissions(user.UserId)

    const payload = {
      userId: user.UserId,
      email: user.Email,
      displayName: user.DisplayName,
      isExternal: !!user.IsExternal,
      roles: roles.map(r => r.roleName),
    }
    const token = signToken(payload, !!user.IsExternal)

    sendOk(res, { token, user: payload, permissions })
  }))

  router.get('/api/auth/me', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query('SELECT UserId, Email, DisplayName, IsExternal, IsActive, LastLoginAt FROM dbo.Users WHERE UserId = @UserId')
    const user = result.recordset?.[0]
    if (!user || !user.IsActive) return sendError(res, 401, 'Kullanıcı bulunamadı.')

    const rolesResult = await sqlPool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query('SELECT r.RoleId, r.RoleName FROM dbo.Roles r JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId WHERE ur.UserId = @UserId AND r.IsActive = 1')
    const roles = (rolesResult.recordset || []).map(r => ({ roleId: r.RoleId, roleName: r.RoleName }))
    const permissions = await loadUserPermissions(req.user.userId)

    sendOk(res, {
      user: {
        userId: user.UserId,
        email: user.Email,
        displayName: user.DisplayName,
        isExternal: !!user.IsExternal,
        lastLoginAt: user.LastLoginAt,
        roles: roles.map(r => r.roleName),
      },
      permissions,
    })
  })))

  router.post('/api/auth/refresh', wrapHandler(requireAuth(async (req, res) => {
    const permissions = await loadUserPermissions(req.user.userId)
    const payload = {
      userId: req.user.userId,
      email: req.user.email,
      displayName: req.user.displayName,
      isExternal: req.user.isExternal,
      roles: req.user.roles,
    }
    const token = signToken(payload, req.user.isExternal)
    sendOk(res, { token, permissions })
  })))

  router.post('/api/auth/change-password', wrapHandler(requireAuth(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const currentPassword = (body.currentPassword || '').toString()
    const newPassword = (body.newPassword || '').toString()
    if (!currentPassword || !newPassword) return sendError(res, 400, 'Mevcut şifre ve yeni şifre gerekli.')
    if (newPassword.length < 6) return sendError(res, 400, 'Yeni şifre en az 6 karakter olmalı.')

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query('SELECT PasswordHash FROM dbo.Users WHERE UserId = @UserId')
    const user = result.recordset?.[0]
    if (!user) return sendError(res, 404, 'Kullanıcı bulunamadı.')

    if (user.PasswordHash !== INITIAL_MARKER) {
      const valid = await bcrypt.compare(currentPassword, user.PasswordHash)
      if (!valid) return sendError(res, 401, 'Mevcut şifre hatalı.')
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await sqlPool.request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Hash', sql.NVarChar(500), hash)
      .query('UPDATE dbo.Users SET PasswordHash = @Hash WHERE UserId = @UserId')

    sendOk(res, { message: 'Şifre değiştirildi.' })
  })))
}

module.exports = { register }
