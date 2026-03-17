import { API_BASE } from '../config'

const TOKEN_KEY = 'orca_token'

function getAuthHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

class ApiClient {
  // POST istekleri ERP ve DB tarafında uzun sürebileceği için zaman aşımı süresini yüksek tut.
  private readonly timeoutMs   = 120_000
  private readonly maxRetries  = 3
  private readonly controllers = new Map<string, AbortController>()

  private getController(key: string, abortPrevious: boolean): AbortController {
    if (abortPrevious) this.controllers.get(key)?.abort()
    const ctrl = new AbortController()
    this.controllers.set(key, ctrl)
    return ctrl
  }

  private async fetchWithRetry<T>(
    url: string,
    init: RequestInit,
    retries = this.maxRetries
  ): Promise<T> {
    const method = init.method ?? 'GET'
    const abortPrevious = method !== 'GET'
    const ctrl = this.getController(`${method}:${url}`, abortPrevious)
    const timeout = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(timeout)
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      if (!text || !text.trim()) return {} as T
      try {
        return JSON.parse(text) as T
      } catch {
        return {} as T
      }
    } catch (err) {
      clearTimeout(timeout)
      if (retries > 0 && !(err instanceof DOMException && err.name === 'AbortError')) {
        await new Promise(r => setTimeout(r, (this.maxRetries - retries + 1) * 500))
        return this.fetchWithRetry(url, init, retries - 1)
      }
      throw err
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(API_BASE + path, { method: 'GET', headers: getAuthHeaders() })
  }

  /** options.noRetry: true = 5xx/network hata olsa bile yeniden deneme (tek istek, çift kayıt riski yok). */
  async post<T = unknown>(path: string, body: unknown, options?: { noRetry?: boolean }): Promise<T> {
    const retries = options?.noRetry ? 0 : this.maxRetries
    return this.fetchWithRetry<T>(API_BASE + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify(body),
    }, retries)
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.fetchWithRetry<T>(API_BASE + path, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify(body),
    })
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(API_BASE + path, { method: 'DELETE', headers: getAuthHeaders() })
  }
}

export const api = new ApiClient()
