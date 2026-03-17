// vitest globals (describe, it, expect) are injected by vitest with globals: true

// We test the pure functions from erp-client
const {
  getRunProcQty1,
  getRowQuantity,
  checkRunProcSufficiency,
  formatOrderAsnDate,
} = require('../scripts/shared/erp-client.cjs')

describe('getRunProcQty1', () => {
  it('returns number from Qty1', () => {
    expect(getRunProcQty1({ Qty1: 5 })).toBe(5)
  })
  it('returns number from qty1 (lowercase)', () => {
    expect(getRunProcQty1({ qty1: 10 })).toBe(10)
  })
  it('parses string', () => {
    expect(getRunProcQty1({ Qty1: '42' })).toBe(42)
  })
  it('returns 0 for null', () => {
    expect(getRunProcQty1({})).toBe(0)
  })
  it('returns 0 for NaN', () => {
    expect(getRunProcQty1({ Qty1: 'abc' })).toBe(0)
  })
})

describe('getRowQuantity', () => {
  it('returns number', () => {
    expect(getRowQuantity({ quantity: 3 })).toBe(3)
  })
  it('returns from Quantity', () => {
    expect(getRowQuantity({ Quantity: 7 })).toBe(7)
  })
  it('returns 0 for missing', () => {
    expect(getRowQuantity({})).toBe(0)
  })
})

describe('checkRunProcSufficiency', () => {
  it('returns empty if all sufficient', () => {
    const runProc = [{ UsedBarcode: '123', Qty1: 10, _poNumber: 'PO1' }]
    const rows = [{ barcode: '123', quantity: 5, poNumber: 'PO1' }]
    expect(checkRunProcSufficiency(runProc, rows, {})).toEqual([])
  })
  it('returns insufficient barcodes', () => {
    const runProc = [{ UsedBarcode: '123', Qty1: 2, _poNumber: 'PO1' }]
    const rows = [{ barcode: '123', quantity: 5, poNumber: 'PO1' }]
    expect(checkRunProcSufficiency(runProc, rows, {})).toEqual(['123'])
  })
  it('considers reserved quantities', () => {
    const runProc = [{ UsedBarcode: '123', Qty1: 10, _poNumber: 'PO1' }]
    const rows = [{ barcode: '123', quantity: 5, poNumber: 'PO1' }]
    const reserved = { '123|PO1': 8 }
    expect(checkRunProcSufficiency(runProc, rows, reserved)).toEqual(['123'])
  })
})

describe('formatOrderAsnDate', () => {
  it('returns yyyy-mm-dd for iso format', () => {
    expect(formatOrderAsnDate('2025-01-15')).toBe('2025-01-15')
  })
  it('converts dd/mm/yyyy', () => {
    expect(formatOrderAsnDate('15/01/2025')).toBe('2025-01-15')
  })
  it('returns today for null', () => {
    const result = formatOrderAsnDate(null)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
