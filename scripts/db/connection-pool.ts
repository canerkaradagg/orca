/**
 * SQL Server Connection Pool – OrcaAlokasyon DB
 */

import sql from 'mssql'

// OrcaAlokasyon = veritabanı adı; SQL Server girişi (login) genelde "Allocation" olur
const rawUser = process.env.DB_USER || 'Allocation'
const loginUser = (rawUser && String(rawUser).trim().toLowerCase() === 'orcaalokasyon') ? 'Allocation' : rawUser

if (!process.env.DB_SERVER) {
  console.warn('[connection-pool] DB_SERVER tanımlı değil – .env dosyasını kontrol edin.')
}

const config = {
  server:   process.env.DB_SERVER   || 'localhost',
  database: process.env.DB_NAME     || 'OrcaAlokasyon',
  user:     loginUser,
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt:                 false,
    trustServerCertificate:  true,
    enableArithAbort:        true,
    connectionTimeout:       30000,
    requestTimeout:          90000,
  },
  pool: { max: 20, min: 0, idleTimeoutMillis: 30000 },
} as sql.config

type PreparedStatementWrapper = {
  all(...params: unknown[]): Promise<unknown[]>
  get(...params: unknown[]): Promise<unknown | null>
  run(...params: unknown[]): Promise<{ lastInsertRowid: number | null; changes: number }>
}

class PreparedStatementWrapperImpl implements PreparedStatementWrapper {
  constructor(
    private _pool: sql.ConnectionPool,
    private _sqlQuery: string
  ) {}

  async all(...params: unknown[]): Promise<unknown[]> {
    const request = this._pool.request()
    const converted = this._convertParams(this._sqlQuery, params, request)
    const result = await request.query(converted)
    return result.recordset || []
  }

  async get(...params: unknown[]): Promise<unknown | null> {
    const rows = await this.all(...params)
    return (rows as unknown[])[0] ?? null
  }

  async run(...params: unknown[]): Promise<{ lastInsertRowid: number | null; changes: number }> {
    const request = this._pool.request()
    const converted = this._convertParams(this._sqlQuery, params, request)
    if (this._sqlQuery.trim().toUpperCase().startsWith('INSERT')) {
      const modifiedSql = converted + '; SELECT SCOPE_IDENTITY() AS lastInsertRowid;'
      const result = await request.query(modifiedSql)
      const recordsets = result.recordsets as unknown[] | undefined
      const lastSet = recordsets && recordsets.length
        ? recordsets[recordsets.length - 1]
        : result.recordset
      const rawId = (lastSet as Record<string, unknown>[])?.[0]?.lastInsertRowid ?? (result.recordset as Record<string, unknown>[])?.[0]?.lastInsertRowid
      return { lastInsertRowid: rawId != null ? Number(rawId) : null, changes: result.rowsAffected?.[0] || 0 }
    }
    const result = await request.query(converted)
    return { lastInsertRowid: null, changes: result.rowsAffected?.[0] || 0 }
  }

  _convertParams(sqlQuery: string, params: unknown[], request: sql.Request): string {
    let paramIndex = 0
    return sqlQuery.replace(/\?/g, () => {
      const name  = `p${paramIndex}`
      const value = params[paramIndex]
      if (value === null || value === undefined) {
        request.input(name, sql.NVarChar, null)
      } else if (typeof value === 'number') {
        request.input(name, sql.Int, value)
      } else if (typeof value === 'boolean') {
        request.input(name, sql.Bit, value ? 1 : 0)
      } else {
        request.input(name, sql.NVarChar, String(value))
      }
      paramIndex++
      return `@${name}`
    })
  }
}

class DatabasePool {
  private _pool: sql.ConnectionPool | null = null
  private _preparedStatements = new Map<string, {
    _sqlQuery: string
    _poolInstance: sql.ConnectionPool | null
    _ensurePool(): Promise<sql.ConnectionPool>
    all(...params: unknown[]): Promise<unknown[]>
    get(...params: unknown[]): Promise<unknown | null>
    run(...params: unknown[]): Promise<{ lastInsertRowid: number | null; changes: number }>
  }>()
  private _initialized = false
  private _connectionPromise: Promise<void> | null = null
  private _lastConnectError: Error | null = null
  private _lastConnectFailAt = 0
  private _failureTtl = 60000

  async getPool(): Promise<sql.ConnectionPool> {
    const now = Date.now()
    if (this._lastConnectError && (now - this._lastConnectFailAt) < this._failureTtl) {
      throw this._lastConnectError
    }
    if (!this._pool) {
      if (!this._connectionPromise) {
        this._connectionPromise = this._connect()
      }
      await this._connectionPromise
    }
    return this._pool!
  }

  private async _connect(): Promise<void> {
    try {
      this._pool = await sql.connect(config)
      this._lastConnectError  = null
      this._lastConnectFailAt = 0
      this._initialized       = true
      console.log('[connection-pool] Bağlandı:', config.database, '@', config.server)
      this._pool.on('error', (err: Error) => {
        console.error('[connection-pool] pool error:', err)
        this._pool              = null
        this._connectionPromise = null
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[connection-pool] Bağlantı hatası:', msg)
      this._pool              = null
      this._connectionPromise = null
      const wrapped = new Error('SQL Server bağlantı hatası: ' + msg)
      this._lastConnectError  = wrapped
      this._lastConnectFailAt = Date.now()
      throw wrapped
    }
  }

  getPreparedStatement(sqlQuery: string, mode = 'read'): {
    all(...params: unknown[]): Promise<unknown[]>
    get(...params: unknown[]): Promise<unknown | null>
    run(...params: unknown[]): Promise<{ lastInsertRowid: number | null; changes: number }>
  } {
    const key = `${mode}:${sqlQuery}`
    if (!this._preparedStatements.has(key)) {
      const mgr = this
      const wrapper = {
        _sqlQuery:     sqlQuery,
        _poolInstance: null as sql.ConnectionPool | null,
        async _ensurePool() {
          if (!this._poolInstance) this._poolInstance = await mgr.getPool()
          return this._poolInstance
        },
        async all(...params: unknown[]) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapperImpl(pool, this._sqlQuery).all(...params)
        },
        async get(...params: unknown[]) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapperImpl(pool, this._sqlQuery).get(...params)
        },
        async run(...params: unknown[]) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapperImpl(pool, this._sqlQuery).run(...params)
        },
      }
      this._preparedStatements.set(key, wrapper)
    }
    return this._preparedStatements.get(key)!
  }

  async exists(): Promise<boolean> {
    if (this._initialized && this._pool) return true
    try { await this.getPool(); return true } catch { return false }
  }

  getPath(): string { return `${config.server}/${config.database}` }

  async close(): Promise<void> {
    if (this._pool) {
      try { await this._pool.close() } catch {}
      this._pool = null
    }
    this._preparedStatements.clear()
    this._initialized       = false
    this._connectionPromise = null
  }
}

let poolInstance: DatabasePool | null = null
export function getPool(): DatabasePool {
  if (!poolInstance) poolInstance = new DatabasePool()
  return poolInstance
}

export { DatabasePool }
