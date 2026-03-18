/**
 * ORCA – In-memory rate limiter (per key, sliding or fixed window)
 * key = e.g. IP; windowMs = window length; max = max requests per window
 */

import type { IncomingMessage, ServerResponse } from 'http'

const store = new Map<string, { count: number; resetAt: number }>()

function getNow(): number {
  return Date.now()
}

export function check(key: string, windowMs: number, max: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = getNow()
  let entry = store.get(key)
  if (!entry) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }
  if (now >= entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + windowMs
  }
  const allowed = entry.count < max
  if (allowed) entry.count += 1
  const remaining = Math.max(0, max - entry.count)
  return { allowed, remaining, resetAt: entry.resetAt }
}

/** Remove expired entries to avoid unbounded growth (call periodically if needed) */
export function prune(): void {
  const now = getNow()
  for (const [k, v] of store.entries()) {
    if (now >= v.resetAt) store.delete(k)
  }
}

export { getNow }

export interface RateLimitOptions {
  windowMs: number
  max: number
  getKey: (req: IncomingMessage) => string
  skipWhen?: (req: IncomingMessage) => boolean
}

export function createMiddleware(opts: RateLimitOptions) {
  const { windowMs, max, getKey, skipWhen } = opts
  return (handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>) =>
    async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> => {
      if (skipWhen && skipWhen(req)) {
        await handler(req, res, params)
        return
      }
      const key = getKey(req)
      const { allowed, resetAt } = check(key, windowMs, max)
      if (!allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((resetAt - getNow()) / 1000)),
        })
        res.end(JSON.stringify({ ok: false, error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' }))
        return
      }
      await handler(req, res, params)
    }
}
