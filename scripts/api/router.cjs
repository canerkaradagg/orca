/**
 * ORCA – Lightweight API Router (no external dependency)
 */

class Router {
  constructor() {
    this._routes = []
  }

  get(path, handler)   { this._routes.push({ method: 'GET',    path, handler }); return this }
  post(path, handler)  { this._routes.push({ method: 'POST',   path, handler }); return this }
  put(path, handler)   { this._routes.push({ method: 'PUT',    path, handler }); return this }
  patch(path, handler) { this._routes.push({ method: 'PATCH',  path, handler }); return this }
  del(path, handler)   { this._routes.push({ method: 'DELETE', path, handler }); return this }

  _matchPath(routePath, requestPath) {
    const routeParts = routePath.split('/').filter(Boolean)
    const reqParts   = requestPath.split('/').filter(Boolean)
    if (routeParts.length !== reqParts.length) return null
    const params = {}
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = decodeURIComponent(reqParts[i])
      } else if (routeParts[i].toLowerCase() !== reqParts[i].toLowerCase()) {
        return null
      }
    }
    return params
  }

  async handle(req, res) {
    const url    = req.originalUrl || req.url || '/'
    const qIdx   = url.indexOf('?')
    const pathname = (qIdx >= 0 ? url.slice(0, qIdx) : url).replace(/\/+$/, '') || '/'
    const method = (req.method || 'GET').toUpperCase()

    for (const route of this._routes) {
      if (route.method !== method && !(route.method === 'PUT' && method === 'PATCH')) continue
      const params = this._matchPath(route.path, pathname)
      if (params !== null) {
        await route.handler(req, res, params)
        return true
      }
    }
    return false
  }
}

module.exports = { Router }
