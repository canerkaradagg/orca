/**
 * ORCA – JWT Authentication Middleware
 */

import jwt from 'jsonwebtoken'
import type { IncomingMessage, ServerResponse } from 'http'
import { getPool } from '../db/connection-pool'
import sql from 'mssql'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET tanımlı değil – .env dosyasını kontrol edin.')
  return secret
}

export const TOKEN_TTL_INTERNAL = '8h'
export const TOKEN_TTL_EXTERNAL = '24h'

export function signToken(payload: Record<string, unknown>, isExternal = false): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: isExternal ? TOKEN_TTL_EXTERNAL : TOKEN_TTL_INTERNAL })
}

export function verifyToken(token: string): Record<string, unknown> {
  return jwt.verify(token, getJwtSecret()) as Record<string, unknown>
}

export function extractToken(req: IncomingMessage): string | null {
  const auth = (req.headers?.authorization as string) || (req.headers?.Authorization as string) || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function loadUserPermissions(userId: number): Promise<Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }>> {
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
  const perms: Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }> = {}
  for (const row of result.recordset || []) {
    const code = row.ScreenCode
    if (!perms[code]) perms[code] = { canView: false, canEdit: false, canDelete: false }
    if (row.CanView)   perms[code].canView = true
    if (row.CanEdit)   perms[code].canEdit = true
    if (row.CanDelete) perms[code].canDelete = true
  }
  return perms
}

type RouteHandler = (req: IncomingMessage & { user?: Record<string, unknown> }, res: ServerResponse, params: Record<string, string>) => Promise<void>

export function requireAuth(handlerFn: RouteHandler): RouteHandler {
  return async (req, res, params) => {
    const token = extractToken(req)
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Token gerekli.' }))
      return
    }
    try {
      const decoded = verifyToken(token) as Record<string, unknown>
      (req as IncomingMessage & { user: Record<string, unknown> }).user = decoded
    } catch (err) {
      const msg = (err as Error & { name?: string }).name === 'TokenExpiredError' ? 'Token süresi dolmuş.' : 'Geçersiz token.'
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: msg }))
      return
    }
    await handlerFn(req, res, params)
  }
}

export function requireScreen(screenCode: string, permission: 'canView' | 'canEdit' | 'canDelete' = 'canView') {
  return (handlerFn: RouteHandler): RouteHandler => {
    return requireAuth(async (req, res, params) => {
      const perms = await loadUserPermissions((req.user!.userId as number))
      const screenPerm = perms[screenCode]
      if (!screenPerm || !screenPerm[permission]) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Bu ekrana erişim yetkiniz yok.' }))
        return
      }
      (req as IncomingMessage & { user: Record<string, unknown> }).user = { ...req.user, permissions: perms }
      await handlerFn(req, res, params)
    })
  }
}

export function requireAuthOrInternalKey(handlerFn: RouteHandler): RouteHandler {
  return async (req, res, params) => {
    const internalKey = process.env.INTERNAL_SERVICE_API_KEY
    const providedKey = (req.headers?.['x-internal-api-key'] as string) || (req.headers?.['X-Internal-API-Key'] as string) || ''
    if (internalKey && providedKey === internalKey) {
      (req as IncomingMessage & { user: Record<string, unknown> }).user = { userId: 0, isInternalService: true }
      await handlerFn(req, res, params)
      return
    }
    return requireAuth(handlerFn)(req, res, params)
  }
}
