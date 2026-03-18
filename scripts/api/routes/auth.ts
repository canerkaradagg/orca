/**
 * ORCA – Auth Routes (login, me, refresh, change-password)
 */

import { getPool } from '../../db/connection-pool'
import sql from 'mssql'
import bcrypt from 'bcryptjs'
import { readBody, sendOk, sendError, wrapHandler, validateBody } from '../middleware'
import { loginSchema } from '../validators/auth'
import { createMiddleware } from '../rate-limiter'
import { signToken, requireAuth, loadUserPermissions } from '../auth-middleware'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Router } from '../router'

const loginRateLimit = createMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 5,
  getKey: (req) => req.socket?.remoteAddress || 'unknown',
})

const BCRYPT_ROUNDS = 12
const INITIAL_MARKER = '$INITIAL$'

export function register(router: Router): void {
  router.get('/api/health', async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'ORCA API çalışıyor' }))
  })

  const loginHandler = async (req: IncomingMessage & { body?: unknown }, res: ServerResponse, _params: Record<string, string>) => {
    const body = req.body as { email: string; password: string }
    const email = body.email.trim().toLowerCase()
    const password = body.password
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('Email', sql.NVarChar(200), email)
      .query('SELECT UserId, Email, DisplayName, PasswordHash, IsExternal, IsActive FROM dbo.Users WHERE LOWER(Email) = @Email')
    const user = (result.recordset as Record<string, unknown>[])?.[0]
    if (!user || !user.IsActive) return sendError(res, 401, 'Geçersiz email veya şifre.')
    if (user.PasswordHash === INITIAL_MARKER) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      await sqlPool.request()
        .input('UserId', sql.Int, user.UserId)
        .input('Hash', sql.NVarChar(500), hash)
        .query('UPDATE dbo.Users SET PasswordHash = @Hash, LastLoginAt = GETDATE() WHERE UserId = @UserId')
    } else {
      const valid = await bcrypt.compare(password, user.PasswordHash as string)
      if (!valid) return sendError(res, 401, 'Geçersiz email veya şifre.')
      await sqlPool.request()
        .input('UserId', sql.Int, user.UserId)
        .query('UPDATE dbo.Users SET LastLoginAt = GETDATE() WHERE UserId = @UserId')
    }
    const rolesResult = await sqlPool.request()
      .input('UserId', sql.Int, user.UserId)
      .query('SELECT r.RoleId, r.RoleName FROM dbo.Roles r JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId WHERE ur.UserId = @UserId AND r.IsActive = 1')
    const roles = (rolesResult.recordset || []).map((r: Record<string, unknown>) => ({ roleId: r.RoleId, roleName: r.RoleName }))
    const permissions = await loadUserPermissions(user.UserId as number)
    const payload = {
      userId: user.UserId,
      email: user.Email,
      displayName: user.DisplayName,
      isExternal: !!user.IsExternal,
      roles: roles.map((r: { roleId: unknown; roleName: unknown }) => String(r.roleName)),
    }
    const token = signToken(payload, !!user.IsExternal)
    sendOk(res, { token, user: payload, permissions } as Record<string, unknown>)
  }
  router.post('/api/auth/login', wrapHandler(loginRateLimit(validateBody(loginSchema)(loginHandler))))

  router.get('/api/auth/me', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('UserId', sql.Int, req.user!.userId)
      .query('SELECT UserId, Email, DisplayName, IsExternal, IsActive, LastLoginAt FROM dbo.Users WHERE UserId = @UserId')
    const user = (result.recordset as Record<string, unknown>[])?.[0]
    if (!user || !user.IsActive) return sendError(res, 401, 'Kullanıcı bulunamadı.')

    const rolesResult = await sqlPool.request()
      .input('UserId', sql.Int, req.user!.userId)
      .query('SELECT r.RoleId, r.RoleName FROM dbo.Roles r JOIN dbo.UserRoles ur ON ur.RoleId = r.RoleId WHERE ur.UserId = @UserId AND r.IsActive = 1')
    const roles = (rolesResult.recordset || []).map((r: Record<string, unknown>) => ({ roleId: r.RoleId, roleName: r.RoleName }))
    const permissions = await loadUserPermissions(req.user!.userId as number)

    const data: Record<string, unknown> = {
      user: {
        userId: user.UserId,
        email: user.Email,
        displayName: user.DisplayName,
        isExternal: !!user.IsExternal,
        lastLoginAt: user.LastLoginAt,
        roles: roles.map((r: { roleId: unknown; roleName: unknown }) => String(r.roleName)),
      },
      permissions,
    }
    sendOk(res, data)
  })))

  router.post('/api/auth/refresh', wrapHandler(requireAuth(async (req, res) => {
    const permissions = await loadUserPermissions(req.user!.userId as number)
    const payload = {
      userId: req.user!.userId,
      email: req.user!.email,
      displayName: req.user!.displayName,
      isExternal: req.user!.isExternal,
      roles: req.user!.roles,
    }
    const token = signToken(payload, req.user!.isExternal as boolean)
    sendOk(res, { token, permissions } as Record<string, unknown>)
  })))

  router.post('/api/auth/change-password', wrapHandler(requireAuth(async (req, res) => {
    const body = JSON.parse(await readBody(req)) as { currentPassword?: string; newPassword?: string }
    const currentPassword = (body.currentPassword || '').toString()
    const newPassword = (body.newPassword || '').toString()
    if (!currentPassword || !newPassword) return sendError(res, 400, 'Mevcut şifre ve yeni şifre gerekli.')
    if (newPassword.length < 6) return sendError(res, 400, 'Yeni şifre en az 6 karakter olmalı.')

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('UserId', sql.Int, req.user!.userId)
      .query('SELECT PasswordHash FROM dbo.Users WHERE UserId = @UserId')
    const user = (result.recordset as Record<string, unknown>[])?.[0]
    if (!user) return sendError(res, 404, 'Kullanıcı bulunamadı.')

    if (user.PasswordHash !== INITIAL_MARKER) {
      const valid = await bcrypt.compare(currentPassword, user.PasswordHash as string)
      if (!valid) return sendError(res, 401, 'Mevcut şifre hatalı.')
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await sqlPool.request()
      .input('UserId', sql.Int, req.user!.userId)
      .input('Hash', sql.NVarChar(500), hash)
      .query('UPDATE dbo.Users SET PasswordHash = @Hash WHERE UserId = @UserId')

    sendOk(res, { message: 'Şifre değiştirildi.' })
  })))
}
