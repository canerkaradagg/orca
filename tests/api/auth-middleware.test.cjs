// vitest globals (describe, it, expect, vi, beforeEach) – vitest with globals: true

process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests'

const {
  extractToken,
  signToken,
  verifyToken,
  requireAuth,
  requireAuthOrInternalKey,
} = require('../../dist/scripts/api/auth-middleware')

describe('extractToken', () => {
  it('returns token from Authorization Bearer header', () => {
    const req = { headers: { authorization: 'Bearer abc123' } }
    expect(extractToken(req)).toBe('abc123')
  })

  it('returns token from Authorization (capital A)', () => {
    const req = { headers: { Authorization: 'Bearer xyz789' } }
    expect(extractToken(req)).toBe('xyz789')
  })

  it('returns null when no Authorization header', () => {
    const req = { headers: {} }
    expect(extractToken(req)).toBeNull()
  })

  it('returns null when Authorization does not start with Bearer ', () => {
    const req = { headers: { authorization: 'Basic xxx' } }
    expect(extractToken(req)).toBeNull()
  })
})

describe('signToken / verifyToken', () => {
  it('signs and verifies token round-trip', () => {
    const payload = { userId: 1, email: 'test@test.com' }
    const token = signToken(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)

    const decoded = verifyToken(token)
    expect(decoded.userId).toBe(1)
    expect(decoded.email).toBe('test@test.com')
    expect(decoded.exp).toBeDefined()
  })

  it('throws on invalid token', () => {
    expect(() => verifyToken('invalid-token')).toThrow()
  })

  it('throws on expired token', () => {
    const jwt = require('jsonwebtoken')
    const payload = { userId: 1 }
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '-1s' })
    expect(() => verifyToken(token)).toThrow(/süresi|expired|invalid/i)
  })
})

describe('requireAuth', () => {
  it('returns 401 when no token', async () => {
    const req = { headers: {} }
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    }
    const handler = vi.fn()

    const wrapped = requireAuth(handler)
    await wrapped(req, res)

    expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' })
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ ok: false, error: 'Token gerekli.' }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler when valid token', async () => {
    const payload = { userId: 42, email: 'u@t.com' }
    const token = signToken(payload)
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = { headersSent: false }
    const handler = vi.fn().mockResolvedValue(undefined)

    const wrapped = requireAuth(handler)
    await wrapped(req, res)

    expect(handler).toHaveBeenCalled()
    expect(req.user).toEqual(expect.objectContaining({ userId: 42, email: 'u@t.com' }))
  })
})

describe('requireAuthOrInternalKey', () => {
  const originalKey = process.env.INTERNAL_SERVICE_API_KEY

  afterEach(() => {
    process.env.INTERNAL_SERVICE_API_KEY = originalKey
  })

  it('allows access with valid internal key', async () => {
    process.env.INTERNAL_SERVICE_API_KEY = 'secret-key-123'
    const req = { headers: { 'x-internal-api-key': 'secret-key-123' } }
    const res = { headersSent: false }
    const handler = vi.fn().mockResolvedValue(undefined)

    const wrapped = requireAuthOrInternalKey(handler)
    await wrapped(req, res)

    expect(handler).toHaveBeenCalled()
    expect(req.user).toEqual(expect.objectContaining({ isInternalService: true }))
  })

  it('falls back to requireAuth when key is wrong', async () => {
    process.env.INTERNAL_SERVICE_API_KEY = 'secret-key-123'
    const req = { headers: { 'x-internal-api-key': 'wrong-key' } }
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    }
    const handler = vi.fn()

    const wrapped = requireAuthOrInternalKey(handler)
    await wrapped(req, res)

    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object))
    expect(handler).not.toHaveBeenCalled()
  })
})
