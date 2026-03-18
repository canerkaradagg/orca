// vitest globals – parameters route logic (middleware/sendOk/sendError)

const { getQueryParams } = require('../../dist/scripts/api/middleware')

describe('getQueryParams', () => {
  it('parses query string', () => {
    const url = 'http://localhost/api/parameters?page=1&size=10'
    const q = getQueryParams(url)
    expect(q.page).toBe('1')
    expect(q.size).toBe('10')
  })

  it('returns empty object for URL without query', () => {
    const url = '/api/parameters'
    const q = getQueryParams(url)
    expect(q).toEqual({})
  })

  it('handles relative URL with query', () => {
    const url = '/api/parameters?key=value'
    const q = getQueryParams(url)
    expect(q.key).toBe('value')
  })
})
