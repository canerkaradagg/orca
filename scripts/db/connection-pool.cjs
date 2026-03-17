/**
 * SQL Server Connection Pool – OrcaAlokasyon DB
 */

const sql = require('mssql')

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
}


class PreparedStatementWrapper {
  constructor(pool, sqlQuery) {
    this._pool     = pool
    this._sqlQuery = sqlQuery
  }

  async all(...params) {
    const request = this._pool.request()
    const converted = this._convertParams(this._sqlQuery, params, request)
    const result = await request.query(converted)
    return result.recordset || []
  }

  async get(...params) {
    const rows = await this.all(...params)
    return rows[0] || null
  }

  async run(...params) {
    const request = this._pool.request()
    const converted = this._convertParams(this._sqlQuery, params, request)
    if (this._sqlQuery.trim().toUpperCase().startsWith('INSERT')) {
      const modifiedSql = converted + '; SELECT SCOPE_IDENTITY() AS lastInsertRowid;'
      const result = await request.query(modifiedSql)
      const lastSet = result.recordsets && result.recordsets.length
        ? result.recordsets[result.recordsets.length - 1]
        : result.recordset
      const rawId = lastSet?.[0]?.lastInsertRowid ?? result.recordset?.[0]?.lastInsertRowid
      return { lastInsertRowid: rawId != null ? Number(rawId) : null, changes: result.rowsAffected?.[0] || 0 }
    }
    const result = await request.query(converted)
    return { lastInsertRowid: null, changes: result.rowsAffected?.[0] || 0 }
  }

  _convertParams(sqlQuery, params, request) {
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
  constructor() {
    this._pool              = null
    this._preparedStatements = new Map()
    this._initialized       = false
    this._connectionPromise = null
    this._lastConnectError  = null
    this._lastConnectFailAt = 0
    this._failureTtl        = 60000
  }

  async getPool() {
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
    return this._pool
  }

  async _connect() {
    try {
      this._pool = await sql.connect(config)
      this._lastConnectError  = null
      this._lastConnectFailAt = 0
      this._initialized       = true
      console.log('[connection-pool] Bağlandı:', config.database, '@', config.server)
      this._pool.on('error', (err) => {
        console.error('[connection-pool] pool error:', err)
        this._pool              = null
        this._connectionPromise = null
      })
    } catch (err) {
      console.error('[connection-pool] Bağlantı hatası:', err.message)
      this._pool              = null
      this._connectionPromise = null
      const wrapped = new Error('SQL Server bağlantı hatası: ' + err.message)
      this._lastConnectError  = wrapped
      this._lastConnectFailAt = Date.now()
      throw wrapped
    }
  }

  getPreparedStatement(sqlQuery, mode = 'read') {
    const key = `${mode}:${sqlQuery}`
    if (!this._preparedStatements.has(key)) {
      const mgr = this
      const wrapper = {
        _sqlQuery:     sqlQuery,
        _poolInstance: null,
        async _ensurePool() {
          if (!this._poolInstance) this._poolInstance = await mgr.getPool()
          return this._poolInstance
        },
        async all(...params) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapper(pool, this._sqlQuery).all(...params)
        },
        async get(...params) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapper(pool, this._sqlQuery).get(...params)
        },
        async run(...params) {
          const pool = await this._ensurePool()
          return new PreparedStatementWrapper(pool, this._sqlQuery).run(...params)
        },
      }
      this._preparedStatements.set(key, wrapper)
    }
    return this._preparedStatements.get(key)
  }

  async exists() {
    if (this._initialized && this._pool) return true
    try { await this.getPool(); return true } catch { return false }
  }

  getPath() { return `${config.server}/${config.database}` }

  async close() {
    if (this._pool) {
      try { await this._pool.close() } catch {}
      this._pool = null
    }
    this._preparedStatements.clear()
    this._initialized       = false
    this._connectionPromise = null
  }
}

let poolInstance = null
function getPool() {
  if (!poolInstance) poolInstance = new DatabasePool()
  return poolInstance
}

module.exports = { getPool, DatabasePool }
