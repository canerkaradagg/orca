/**
 * ORCA – API Middleware utilities
 */

import type { ZodSchema } from 'zod'
import type { IncomingMessage, ServerResponse } from 'http'
import logger from '../lib/logger'

export const MAX_BODY_SIZE = 50 * 1024 * 1024 // 50 MB (Excel files can be large)

export function readBody(req: IncomingMessage, maxSize = MAX_BODY_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    req.on('data', (chunk: Buffer | string) => {
      size += (chunk as Buffer).length
      if (size > maxSize) {
        req.destroy()
        reject(new Error(`Body too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`))
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getQueryParams(url: string | undefined): Record<string, string> {
  if (!url || typeof url !== 'string') return {}
  try {
    const base = url.startsWith('http') ? undefined : 'http://localhost'
    const u = base ? new URL(url, base) : new URL(url)
    const q: Record<string, string> = {}
    u.searchParams.forEach((v, k) => { q[k] = decodeURIComponent(v) })
    return q
  } catch {
    const idx = url.indexOf('?')
    if (idx === -1) return {}
    const q: Record<string, string> = {}
    url.slice(idx + 1).split('&').forEach(pair => {
      const [k, v] = pair.split('=')
      if (k && v != null) q[decodeURIComponent(k)] = decodeURIComponent(v)
    })
    return q
  }
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function sendOk(res: ServerResponse, data: Record<string, unknown> = {}): void {
  sendJson(res, 200, { ok: true, ...data })
}

export function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { ok: false, error: message })
}

type RouteHandler = (req: IncomingMessage & { body?: unknown }, res: ServerResponse, params: Record<string, string>) => Promise<void>

export function validateBody(schema: ZodSchema) {
  return (handler: RouteHandler) => async (req: IncomingMessage & { body?: unknown }, res: ServerResponse, params: Record<string, string>): Promise<void> => {
    let raw: unknown
    try {
      raw = JSON.parse(await readBody(req))
    } catch {
      if (!res.headersSent) sendError(res, 400, 'Geçersiz JSON.')
      return
    }
    const result = schema.safeParse(raw)
    if (!result.success) {
      const issues = result.error.issues as Array<{ path: (string | number)[]; message: string }>
      const msg = issues.map(e => `${e.path.join('.') || 'body'}: ${e.message}`).join('; ')
      if (!res.headersSent) sendError(res, 400, msg)
      return
    }
    (req as IncomingMessage & { body: unknown }).body = result.data
    await handler(req as IncomingMessage & { body: unknown }, res, params)
  }
}

export function wrapHandler(fn: RouteHandler): RouteHandler {
  return async (req, res, params) => {
    try {
      await fn(req, res, params)
    } catch (err) {
      logger.error({ method: req.method, url: req.url, err: (err as Error).message }, 'API error')
      if (!res.headersSent) {
        sendError(res, 500, (err as Error).message || String(err))
      }
    }
  }
}
