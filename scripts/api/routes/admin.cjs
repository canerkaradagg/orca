/**
 * ORCA – Admin Routes (roles, users, permissions CRUD)
 */

const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const bcrypt = require('bcryptjs')
const { readBody, sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const { requireAuth } = require('../auth-middleware.cjs')

const BCRYPT_ROUNDS = 12

function adminOnly(handlerFn) {
  return requireAuth(async (req, res, params) => {
    if (!req.user.roles || !req.user.roles.includes('Admin')) {
      return sendError(res, 403, 'Yönetici yetkisi gerekli.')
    }
    await handlerFn(req, res, params)
  })
}

function register(router) {

  // ── SCREENS ───────────────────────────────────
  router.get('/api/admin/screens', wrapHandler(adminOnly(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(
      'SELECT ScreenId, ScreenCode, ScreenName, ParentCode, SortOrder FROM dbo.Screens ORDER BY SortOrder'
    )
    sendOk(res, { screens: result.recordset || [] })
  })))

  // ── ROLES ─────────────────────────────────────
  router.get('/api/admin/roles', wrapHandler(adminOnly(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(`
      SELECT r.RoleId, r.RoleName, r.Description, r.IsActive,
             (SELECT COUNT(*) FROM dbo.UserRoles ur WHERE ur.RoleId = r.RoleId) AS UserCount
      FROM dbo.Roles r ORDER BY r.RoleName
    `)
    sendOk(res, { roles: result.recordset || [] })
  })))

  router.post('/api/admin/roles', wrapHandler(adminOnly(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const name = (body.roleName || '').toString().trim()
    const desc = (body.description || '').toString().trim()
    if (!name) return sendError(res, 400, 'Rol adı gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const exists = await sqlPool.request().input('Name', sql.NVarChar(50), name)
      .query('SELECT 1 FROM dbo.Roles WHERE RoleName = @Name')
    if (exists.recordset?.length) return sendError(res, 409, 'Bu isimde bir rol zaten var.')
    const result = await sqlPool.request()
      .input('Name', sql.NVarChar(50), name)
      .input('Desc', sql.NVarChar(200), desc || null)
      .query('INSERT INTO dbo.Roles (RoleName, Description) OUTPUT INSERTED.RoleId VALUES (@Name, @Desc)')
    sendOk(res, { roleId: result.recordset?.[0]?.RoleId })
  })))

  router.put('/api/admin/roles/:id', wrapHandler(adminOnly(async (req, res, params) => {
    const roleId = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req2 = sqlPool.request().input('RoleId', sql.Int, roleId)
    if (body.roleName != null) req2.input('Name', sql.NVarChar(50), body.roleName.toString().trim())
    if (body.description != null) req2.input('Desc', sql.NVarChar(200), body.description.toString().trim())
    if (body.isActive != null) req2.input('Active', sql.Bit, body.isActive ? 1 : 0)
    const sets = []
    if (body.roleName != null) sets.push('RoleName = @Name')
    if (body.description != null) sets.push('Description = @Desc')
    if (body.isActive != null) sets.push('IsActive = @Active')
    if (sets.length === 0) return sendError(res, 400, 'Güncellenecek alan yok.')
    await req2.query(`UPDATE dbo.Roles SET ${sets.join(', ')} WHERE RoleId = @RoleId`)
    sendOk(res)
  })))

  router.del('/api/admin/roles/:id', wrapHandler(adminOnly(async (req, res, params) => {
    const roleId = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('RoleId', sql.Int, roleId)
      .query('DELETE FROM dbo.RoleScreenPermissions WHERE RoleId = @RoleId')
    await sqlPool.request().input('RoleId', sql.Int, roleId)
      .query('DELETE FROM dbo.UserRoles WHERE RoleId = @RoleId')
    await sqlPool.request().input('RoleId', sql.Int, roleId)
      .query('DELETE FROM dbo.Roles WHERE RoleId = @RoleId')
    sendOk(res)
  })))

  // ── ROLE PERMISSIONS ──────────────────────────
  router.get('/api/admin/roles/:id/permissions', wrapHandler(adminOnly(async (req, res, params) => {
    const roleId = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().input('RoleId', sql.Int, roleId).query(`
      SELECT s.ScreenId, s.ScreenCode, s.ScreenName, s.ParentCode, s.SortOrder,
             ISNULL(rsp.CanView, 0) AS CanView,
             ISNULL(rsp.CanEdit, 0) AS CanEdit,
             ISNULL(rsp.CanDelete, 0) AS CanDelete
      FROM dbo.Screens s
      LEFT JOIN dbo.RoleScreenPermissions rsp ON rsp.ScreenId = s.ScreenId AND rsp.RoleId = @RoleId
      ORDER BY s.SortOrder
    `)
    sendOk(res, { permissions: result.recordset || [] })
  })))

  router.put('/api/admin/roles/:id/permissions', wrapHandler(adminOnly(async (req, res, params) => {
    const roleId = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const perms = Array.isArray(body.permissions) ? body.permissions : []
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('RoleId', sql.Int, roleId)
      .query('DELETE FROM dbo.RoleScreenPermissions WHERE RoleId = @RoleId')
    for (const p of perms) {
      const screenId = p.screenId != null ? parseInt(p.screenId, 10) : 0
      if (!screenId) continue
      await sqlPool.request()
        .input('RoleId', sql.Int, roleId)
        .input('ScreenId', sql.Int, screenId)
        .input('CanView', sql.Bit, p.canView ? 1 : 0)
        .input('CanEdit', sql.Bit, p.canEdit ? 1 : 0)
        .input('CanDelete', sql.Bit, p.canDelete ? 1 : 0)
        .query('INSERT INTO dbo.RoleScreenPermissions (RoleId, ScreenId, CanView, CanEdit, CanDelete) VALUES (@RoleId, @ScreenId, @CanView, @CanEdit, @CanDelete)')
    }
    sendOk(res)
  })))

  // ── USERS ─────────────────────────────────────
  router.get('/api/admin/users', wrapHandler(adminOnly(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().query(`
      SELECT u.UserId, u.Email, u.DisplayName, u.IsExternal, u.IsActive, u.CreatedAt, u.LastLoginAt,
             (SELECT STRING_AGG(r.RoleName, ', ') FROM dbo.Roles r JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId WHERE ur.UserId = u.UserId) AS RoleNames
      FROM dbo.Users u ORDER BY u.DisplayName
    `)
    sendOk(res, { users: result.recordset || [] })
  })))

  router.post('/api/admin/users', wrapHandler(adminOnly(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const email = (body.email || '').toString().trim().toLowerCase()
    const displayName = (body.displayName || '').toString().trim()
    const password = (body.password || '').toString()
    const isExternal = !!body.isExternal
    if (!email || !displayName) return sendError(res, 400, 'Email ve görünen ad gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const exists = await sqlPool.request().input('Email', sql.NVarChar(200), email)
      .query('SELECT 1 FROM dbo.Users WHERE LOWER(Email) = @Email')
    if (exists.recordset?.length) return sendError(res, 409, 'Bu email adresi zaten kayıtlı.')
    const hash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : '$INITIAL$'
    const result = await sqlPool.request()
      .input('Email', sql.NVarChar(200), email)
      .input('Name', sql.NVarChar(100), displayName)
      .input('Hash', sql.NVarChar(500), hash)
      .input('Ext', sql.Bit, isExternal ? 1 : 0)
      .query('INSERT INTO dbo.Users (Email, DisplayName, PasswordHash, IsExternal) OUTPUT INSERTED.UserId VALUES (@Email, @Name, @Hash, @Ext)')
    sendOk(res, { userId: result.recordset?.[0]?.UserId })
  })))

  router.put('/api/admin/users/:id', wrapHandler(adminOnly(async (req, res, params) => {
    const userId = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req2 = sqlPool.request().input('UserId', sql.Int, userId)
    const sets = []
    if (body.displayName != null) { req2.input('Name', sql.NVarChar(100), body.displayName.toString().trim()); sets.push('DisplayName = @Name') }
    if (body.email != null) { req2.input('Email', sql.NVarChar(200), body.email.toString().trim().toLowerCase()); sets.push('Email = @Email') }
    if (body.isActive != null) { req2.input('Active', sql.Bit, body.isActive ? 1 : 0); sets.push('IsActive = @Active') }
    if (body.isExternal != null) { req2.input('Ext', sql.Bit, body.isExternal ? 1 : 0); sets.push('IsExternal = @Ext') }
    if (body.password) {
      const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
      req2.input('Hash', sql.NVarChar(500), hash); sets.push('PasswordHash = @Hash')
    }
    if (sets.length === 0) return sendError(res, 400, 'Güncellenecek alan yok.')
    await req2.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE UserId = @UserId`)
    sendOk(res)
  })))

  // ── USER ROLES ────────────────────────────────
  router.get('/api/admin/users/:id/roles', wrapHandler(adminOnly(async (req, res, params) => {
    const userId = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request().input('UserId', sql.Int, userId).query(`
      SELECT r.RoleId, r.RoleName, r.Description,
             IIF(ur.RoleId IS NOT NULL, 1, 0) AS IsAssigned
      FROM dbo.Roles r
      LEFT JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId AND ur.UserId = @UserId
      WHERE r.IsActive = 1
      ORDER BY r.RoleName
    `)
    sendOk(res, { roles: result.recordset || [] })
  })))

  router.put('/api/admin/users/:id/roles', wrapHandler(adminOnly(async (req, res, params) => {
    const userId = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const roleIds = Array.isArray(body.roleIds) ? body.roleIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)) : []
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('UserId', sql.Int, userId)
      .query('DELETE FROM dbo.UserRoles WHERE UserId = @UserId')
    for (const roleId of roleIds) {
      await sqlPool.request()
        .input('UserId', sql.Int, userId)
        .input('RoleId', sql.Int, roleId)
        .query('INSERT INTO dbo.UserRoles (UserId, RoleId) VALUES (@UserId, @RoleId)')
    }
    sendOk(res)
  })))
}

module.exports = { register }
