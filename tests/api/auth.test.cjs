// vitest globals – auth route logic tests (no DB, no HTTP server)

const { sendOk, sendError } = require('../../dist/scripts/api/middleware')

describe('auth helpers', () => {
  it('sendError returns correct JSON structure', () => {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    }
    sendError(res, 400, 'Bad request')
    expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' })
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ ok: false, error: 'Bad request' }))
  })

  it('sendOk returns ok: true with data', () => {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    }
    sendOk(res, { token: 'abc' })
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' })
    const body = JSON.parse(res.end.mock.calls[0][0])
    expect(body.ok).toBe(true)
    expect(body.token).toBe('abc')
  })
})
