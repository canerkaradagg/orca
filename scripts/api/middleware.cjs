/**
 * ORCA – API Middleware utilities
 */

const MAX_BODY_SIZE = 50 * 1024 * 1024 // 50 MB (Excel files can be large)

function readBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > maxSize) {
        req.destroy()
        reject(new Error(`Body too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`))
        return
      }
      body += chunk
    })
    req.on('end',  () => resolve(body))
    req.on('error', reject)
  })
}

function parseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getQueryParams(url) {
  if (!url || typeof url !== 'string') return {}
  try {
    const base = url.startsWith('http') ? undefined : 'http://localhost'
    const u = base ? new URL(url, base) : new URL(url)
    const q = {}
    u.searchParams.forEach((v, k) => { q[k] = decodeURIComponent(v) })
    return q
  } catch {
    const idx = url.indexOf('?')
    if (idx === -1) return {}
    const q = {}
    url.slice(idx + 1).split('&').forEach(pair => {
      const [k, v] = pair.split('=')
      if (k && v != null) q[decodeURIComponent(k)] = decodeURIComponent(v)
    })
    return q
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function sendOk(res, data = {}) {
  sendJson(res, 200, { ok: true, ...data })
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message })
}

/** Wraps a route handler with standard error handling */
function wrapHandler(fn) {
  return async (req, res, params) => {
    try {
      await fn(req, res, params)
    } catch (err) {
      console.error(`[API] ${req.method} ${req.url} error:`, err.message || err)
      if (!res.headersSent) {
        sendError(res, 500, err.message || String(err))
      }
    }
  }
}

module.exports = {
  readBody,
  parseJson,
  getQueryParams,
  sendJson,
  sendOk,
  sendError,
  wrapHandler,
  MAX_BODY_SIZE,
}
