import { getPool } from '../../db/connection-pool'
import sql from 'mssql'
import { readBody, getQueryParams, sendOk, sendError, wrapHandler } from '../middleware'
import { requireAuth } from '../auth-middleware'
import logger from '../../lib/logger'
import type { Router } from '../router'
import type { IncomingMessage } from 'http'

/** SQL satırını frontend DispOrder formatına (camelCase) çevirir. Union DispApprovals grid ile birebir alan seti. */
function mapDispOrderRow(r: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!r) return null
  const dateStr = (v: unknown) => (v == null ? null : new Date(v as string | number).toISOString().slice(0, 10))
  const dateTimeStr = (v: unknown) => (v == null ? null : new Date(v as string | number).toISOString().slice(0, 19).replace('T', ' '))
  return {
    dispOrderHeaderId: r.DispOrderHeaderId,
    dispOrderNo: r.DispOrderNumber ?? '',
    orderDate: dateStr(r.DispOrderDate),
    customerCode: r.CurrAccCode ?? '',
    customerName: r.CurrAccDescription ?? r.CurrAccCode ?? '',
    warehouseName: r.WarehouseCode ?? '',
    warehouseDescription: r.WarehouseDescription ?? r.WarehouseCode ?? '',
    statusId: r.DispOrderStatusId ?? 0,
    statusName: r.StatusName ?? '',
    approvalDate: dateStr(r.FinancialApproveDate),
    statusDate: dateTimeStr(r.StatusDate ?? r.FinancialApproveDate),
    waitReason: r.WaitReason ?? null,
    totalAmount: Number(r.TotalAmount) || 0,
    totalQty: Number(r.TotalQty) || 0,
    type: r.Type ?? '',
    company: r.Company ?? '',
    sourceDispOrderHeaderId: r.SourceDispOrderHeaderId ?? null,
    currAccTypeCode: r.CurrAccTypeCode ?? null,
    currAccDescription: r.CurrAccDescription ?? '',
    currAccInfo: r.CurrAccInfo ?? '',
    subCurrAccId: r.SubCurrAccId ?? '',
    subCurrAccDescription: r.SubCurrAccDescription ?? '',
    subCurrAccInfo: r.SubCurrAccInfo ?? '',
    warehouseCode: r.WarehouseCode ?? '',
    baseAmount: Number(r.BaseAmount ?? r.Amount ?? r.TotalAmount) || 0,
    itAtt02: r.ITAtt02 ?? r.Season ?? '',
    category: r.Category ?? '',
    brand: r.Brand ?? '',
  }
}

export function register(router: Router): void {

  router.get('/api/finance/statuses', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const mode = (q.mode || 'filter').toLowerCase()
    const where = mode === 'select' ? 'WHERE IsSelect = 1' : 'WHERE IsFilter = 1'
    const result = await sqlPool.request().query(`SELECT StatusId, StatusName, IsFilter, IsSelect FROM dbo.DispOrderStatus WITH (NOLOCK) ${where} ORDER BY SortOrder`)
    const statuses = ((result.recordset as Record<string, unknown>[]) || []).map(r => ({ id: r.StatusId, name: r.StatusName ?? '' }))
    sendOk(res, { statuses })
  })))

  router.get('/api/finance/customers', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const search = (q.search || '').trim().toLowerCase()
    if (!company) return sendOk(res, { customers: [] })
    let customers: { code: string; description: string }[] = []
    let lastError: string | null = null

    try {
      const request = sqlPool.request()
      request.input('Company', sql.NVarChar(10), company)
      let sqlText = `
        SELECT CurrAccCode, CurrAccDescription
        FROM OrcaAlokasyon.ext.Customer WITH (NOLOCK)
        WHERE Company = @Company`
      if (search) {
        request.input('Search', sql.NVarChar(255), '%' + search + '%')
        sqlText += ` AND (CurrAccCode LIKE @Search OR CurrAccDescription LIKE @Search)`
      }
      sqlText += ' ORDER BY CurrAccCode'
      const result = await request.query(sqlText)
      customers = ((result.recordset as Record<string, unknown>[]) || []).map(r => ({
        code: String(r.CurrAccCode ?? ''),
        description: String(r.CurrAccDescription ?? r.CurrAccCode ?? ''),
      }))
    } catch (err) {
      lastError = (err as Error).message || String(err)
      logger.error({ err: lastError, company }, 'finance/customers ext.Customer hatası')
    }

    if (customers.length === 0) {
      try {
        const req2 = sqlPool.request()
        req2.input('Company', sql.NVarChar(10), company)
        let fallbackSql = `
          SELECT DISTINCT doh.CurrAccCode, ISNULL(ec.CurrAccDescription, doh.CurrAccCode) AS CurrAccDescription
          FROM dbo.DispOrderHeader doh WITH (NOLOCK)
          LEFT JOIN OrcaAlokasyon.ext.Customer ec ON ec.CurrAccCode = doh.CurrAccCode AND ec.Company = doh.Company
          WHERE doh.Company = @Company AND doh.Valid = 1`
        if (search) {
          req2.input('Search', sql.NVarChar(255), '%' + search + '%')
          fallbackSql += ` AND (doh.CurrAccCode LIKE @Search OR ISNULL(ec.CurrAccDescription, doh.CurrAccCode) LIKE @Search)`
        }
        fallbackSql += ' ORDER BY doh.CurrAccCode'
        const res2 = await req2.query(fallbackSql)
        customers = ((res2.recordset as Record<string, unknown>[]) || []).map(r => ({
          code: String(r.CurrAccCode ?? ''),
          description: String(r.CurrAccDescription ?? r.CurrAccCode ?? ''),
        }))
      } catch (err2) {
        logger.error({ err: (err2 as Error).message || err2, company }, 'finance/customers fallback hatası')
      }
    }

    sendOk(res, { customers, _error: lastError })
  })))

  router.get('/api/finance/seasons', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const search = (q.search || '').trim()
    if (!company) return sendOk(res, { seasons: [] })
    const request = sqlPool.request()
    request.input('Company', sql.NVarChar(10), company)
    let sqlText = `
      SELECT SeasonCode AS code, SeasonDescription AS description
        FROM ext.Season WITH (NOLOCK)
       WHERE Company = @Company AND ISNULL(SeasonCode, '') != ''`
    if (search) {
      request.input('Search', sql.NVarChar(255), '%' + search + '%')
      sqlText += ` AND (SeasonCode LIKE @Search OR ISNULL(SeasonDescription, '') LIKE @Search)`
    }
    sqlText += ' ORDER BY SeasonCode DESC'
    const result = await request.query(sqlText)
    const seasons = ((result.recordset as Record<string, unknown>[]) || []).map(r => ({
      code: String(r.code ?? ''),
      description: String(r.description ?? r.code ?? ''),
    }))
    sendOk(res, { seasons })
  })))

  router.get('/api/finance/wait-reasons', wrapHandler(requireAuth(async (_req, res) => {
    const reasons = [
      'Vadesi gelmemiş çeki var',
      'Bakiye fazla',
      'Teminat yetersiz',
      'Ödeme bekleniyor',
      'Sözleşme bekleniyor',
      'Diğer'
    ]
    sendOk(res, { reasons })
  })))

  router.post('/api/finance/update-disp-order-header-category-season', wrapHandler(requireAuth(async (req, res) => {
    let body: Record<string, unknown> = {}
    try { const raw = await readBody(req); body = typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : {} } catch (_) {}
    const maxRows = body.maxRows != null ? Math.max(0, parseInt(String(body.maxRows), 10)) : null
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const request = sqlPool.request()
    request.input('DispOrderHeaderId', sql.Int, null)
    if (maxRows != null) request.input('MaxRows', sql.Int, maxRows)
    else request.input('MaxRows', sql.Int, null)
    await request.execute('dbo.UpdateDispOrderHeaderCategorySeason')
    sendOk(res, { ok: true })
  })))

  router.get('/api/finance/cari-ozet', wrapHandler(requireAuth(async (req, res) => {
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    if (!company) return sendOk(res, { rows: [], totalCount: 0 })

    const page = Math.max(1, parseInt(q.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 15))
    const offset = (page - 1) * pageSize

    const customer = (q.customer || '').trim()
    const contract = (q.contract || '').trim().toLowerCase()
    const statusIdsRaw = (q.statusIds || '').trim()
    const statusIds = statusIdsRaw ? statusIdsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0) : []
    const fromDate = (q.fromDate || '').trim()
    const toDate = (q.toDate || '').trim()
    const season = (q.season || '').trim()
    const asnNoRaw = (q.asnNo || '').trim()
    const orderNoRaw = (q.orderNo || '').trim()
    const asnNos = asnNoRaw ? asnNoRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10) : []
    const orderNos = orderNoRaw ? orderNoRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 300) : []
    const limitAmount = Math.max(0, parseFloat(q.limitAmount) || 0)

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req2 = sqlPool.request()
    req2.input('Company', sql.NVarChar(10), company)

    const conditions = ['doh.Company = @Company', 'doh.Valid = 1']
    if (customer) {
      req2.input('Customer', sql.NVarChar(30), customer)
      conditions.push('doh.CurrAccCode = @Customer')
    }
    if (contract === 'yok') {
      conditions.push("LOWER(LTRIM(RTRIM(ISNULL(ec.Contract, '')))) = N'yok'")
    } else if (contract === 'var') {
      conditions.push("(ec.Contract IS NULL OR LOWER(LTRIM(RTRIM(ec.Contract))) <> N'yok')")
    }
    if (statusIds.length > 0) {
      statusIds.forEach((id, i) => req2.input('StatusId' + i, sql.Int, id))
      conditions.push('doh.DispOrderStatusId IN (' + statusIds.map((_, i) => '@StatusId' + i).join(',') + ')')
    }
    if (fromDate) {
      req2.input('FromDate', sql.Date, fromDate)
      conditions.push('doh.DispOrderDate >= @FromDate')
    }
    if (toDate) {
      req2.input('ToDate', sql.Date, toDate)
      conditions.push('doh.DispOrderDate <= @ToDate')
    }
    let seasonJoin = ''
    if (season) {
      req2.input('Season', sql.NVarChar(50), season)
      seasonJoin = `AND (
        EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId AND dol2.ITAtt02 = @Season)
        OR NOT EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId)
      )`
    }
    if (asnNos.length > 0) {
      asnNos.forEach((v, i) => req2.input('AsnNo' + i, sql.NVarChar(100), v))
      conditions.push('doh.AsnNo IN (' + asnNos.map((_, i) => '@AsnNo' + i).join(',') + ')')
    }
    if (orderNos.length > 0) {
      orderNos.forEach((v, i) => req2.input('OrderNo' + i, sql.NVarChar(50), v))
      conditions.push('doh.DispOrderNumber IN (' + orderNos.map((_, i) => '@OrderNo' + i).join(',') + ')')
    }

    const where = conditions.join(' AND ')
    req2.input('Offset', sql.Int, offset)
    req2.input('PageSize', sql.Int, pageSize)
    req2.input('LimitAmount', sql.Float, limitAmount)
    const sqlText = `
      ;WITH agg AS (
        SELECT
          doh.Company,
          doh.CurrAccCode,
          CurrAccDescription = MAX(ISNULL(ec.CurrAccDescription, doh.CurrAccCode)),
          SevkEmriSayisi = COUNT(*),
          PSFTutar = SUM(ISNULL(agg2.BaseAmt, doh.Amount)),
          FaturaTutari = SUM(ISNULL(agg2.TotalAmt, doh.Amount)),
          TutarSevk = SUM(CASE WHEN doh.DispOrderStatusId = 2 THEN ISNULL(agg2.TotalAmt, doh.Amount) ELSE 0 END),
          YeniTutarSevk = SUM(CASE WHEN doh.DispOrderStatusId = 2 THEN ISNULL(agg2.TotalAmt, doh.Amount) ELSE 0 END),
          HasBeklet = MAX(CASE WHEN doh.DispOrderStatusId = 1 THEN 1 ELSE 0 END),
          HasAllOnayli = MIN(CASE WHEN doh.DispOrderStatusId = 2 THEN 1 ELSE 0 END),
          WaitReasonSample = MAX(CASE WHEN doh.DispOrderStatusId = 1 THEN doh.WaitReason ELSE NULL END)
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        LEFT JOIN ext.Customer ec ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
        OUTER APPLY (SELECT BaseAmt = SUM(dol.BaseAmount), TotalAmt = SUM(dol.TotalAmount) FROM dbo.DispOrderLine dol WITH (NOLOCK) WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId AND dol.Valid = 1) agg2
        WHERE ${where} ${seasonJoin}
        GROUP BY doh.Company, doh.CurrAccCode
      ),
      filtered AS ( SELECT * FROM agg WHERE ( @LimitAmount <= 0 OR FaturaTutari >= @LimitAmount ) ),
      counted AS ( SELECT *, _totalCount = (SELECT COUNT(*) FROM filtered) FROM filtered )
      SELECT * FROM counted
      ORDER BY Company, CurrAccCode
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `
    const result = await req2.query(sqlText)
    const raw = (result.recordset as Record<string, unknown>[]) || []
    let totalCount = raw.length > 0 ? (raw[0]._totalCount ?? 0) : 0
    if (raw.length === 0) {
      const countSql = `
        ;WITH agg AS (
          SELECT doh.Company, doh.CurrAccCode,
            FaturaTutari = SUM(ISNULL(agg2.TotalAmt, doh.Amount))
          FROM dbo.DispOrderHeader doh WITH (NOLOCK)
          LEFT JOIN ext.Customer ec ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
          OUTER APPLY (SELECT TotalAmt = SUM(dol.TotalAmount) FROM dbo.DispOrderLine dol WITH (NOLOCK) WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId AND dol.Valid = 1) agg2
          WHERE ${where} ${seasonJoin}
          GROUP BY doh.Company, doh.CurrAccCode
        ),
        filtered AS ( SELECT * FROM agg WHERE ( @LimitAmount <= 0 OR FaturaTutari >= @LimitAmount ) )
        SELECT _totalCount = COUNT(*) FROM filtered
      `
      const countReq = sqlPool.request()
      countReq.input('Company', sql.NVarChar(10), company)
      if (customer) countReq.input('Customer', sql.NVarChar(30), customer)
      statusIds.forEach((id, i) => countReq.input('StatusId' + i, sql.Int, id))
      if (fromDate) countReq.input('FromDate', sql.Date, fromDate)
      if (toDate) countReq.input('ToDate', sql.Date, toDate)
      if (season) countReq.input('Season', sql.NVarChar(50), season)
      asnNos.forEach((v, i) => countReq.input('AsnNo' + i, sql.NVarChar(100), v))
      orderNos.forEach((v, i) => countReq.input('OrderNo' + i, sql.NVarChar(50), v))
      countReq.input('LimitAmount', sql.Float, limitAmount)
      const countResult = await countReq.query(countSql)
      const countRow = (countResult.recordset as Record<string, unknown>[])?.[0]
      totalCount = countRow && countRow._totalCount != null ? Number(countRow._totalCount) : 0
    }
    const rows = raw.map(r => {
      const psf = Number(r.PSFTutar) || 0
      const fatura = Number(r.FaturaTutari) || 0
      const tutarSevk = Number(r.TutarSevk) || 0
      const yeniTutar = Number(r.YeniTutarSevk) || 0
      const hasBeklet = Number(r.HasBeklet) === 1
      const hasAllOnayli = Number(r.HasAllOnayli) === 1
      return {
        company: r.Company ?? '',
        currAccCode: r.CurrAccCode ?? '',
        currAccDescription: r.CurrAccDescription ?? '',
        dispCount: Number(r.SevkEmriSayisi) || 0,
        baseAmount: psf,
        totalAmount: fatura,
        amountApproved: tutarSevk,
        amountApprovedNew: yeniTutar,
        amountApprovedDiff: yeniTutar - tutarSevk,
        hasBeklet,
        hasAllOnayli,
        waitReasonSample: hasBeklet ? (r.WaitReasonSample != null ? String(r.WaitReasonSample).trim() : null) : null,
      }
    })
    sendOk(res, { rows, totalCount })
  })))

  router.get('/api/finance/disp-orders', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const customer = (q.customer || '').trim()
    const contract = (q.contract || '').trim().toLowerCase()
    const statusIdsRaw = (q.statusIds || '').trim()
    const statusIds = statusIdsRaw
      ? statusIdsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
      : []
    const fromDate = (q.fromDate || '').trim()
    const toDate = (q.toDate || '').trim()
    const season = (q.season || '').trim()
    const asnNoRaw = (q.asnNo || '').trim()
    const orderNoRaw = (q.orderNo || '').trim()
    const asnNos = asnNoRaw ? asnNoRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10) : []
    const orderNos = orderNoRaw ? orderNoRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 300) : []
    const page = Math.max(1, parseInt(q.page, 10) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize, 10) || 50))
    const offset = (page - 1) * pageSize

    if (!company) return sendOk(res, { rows: [], totalCount: 0 })

    const request = sqlPool.request()
    request.input('Company', sql.NVarChar(10), company)
    request.input('Offset', sql.Int, offset)
    request.input('PageSize', sql.Int, pageSize)

    const conditions = ['doh.Company = @Company', 'doh.Valid = 1']

    if (customer) {
      request.input('Customer', sql.NVarChar(30), customer)
      conditions.push('doh.CurrAccCode = @Customer')
    }
    if (contract === 'yok') {
      conditions.push("LOWER(LTRIM(RTRIM(ISNULL(ec.Contract, '')))) = N'yok'")
    } else if (contract === 'var') {
      conditions.push("(ec.Contract IS NULL OR LOWER(LTRIM(RTRIM(ec.Contract))) <> N'yok')")
    }
    if (statusIds.length > 0) {
      statusIds.forEach((id, i) => request.input('StatusId' + i, sql.Int, id))
      conditions.push('doh.DispOrderStatusId IN (' + statusIds.map((_, i) => '@StatusId' + i).join(',') + ')')
    }
    if (fromDate) {
      request.input('FromDate', sql.Date, fromDate)
      conditions.push('doh.DispOrderDate >= @FromDate')
    }
    if (toDate) {
      request.input('ToDate', sql.Date, toDate)
      conditions.push('doh.DispOrderDate <= @ToDate')
    }

    let seasonJoin = ''
    if (season) {
      request.input('Season', sql.NVarChar(50), season)
      seasonJoin = `AND (
        EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId AND dol2.ITAtt02 = @Season)
        OR NOT EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId)
      )`
    }
    if (asnNos.length > 0) {
      asnNos.forEach((v, i) => request.input('AsnNo' + i, sql.NVarChar(100), v))
      conditions.push('doh.AsnNo IN (' + asnNos.map((_, i) => '@AsnNo' + i).join(',') + ')')
    }
    if (orderNos.length > 0) {
      orderNos.forEach((v, i) => request.input('OrderNo' + i, sql.NVarChar(50), v))
      conditions.push('doh.DispOrderNumber IN (' + orderNos.map((_, i) => '@OrderNo' + i).join(',') + ')')
    }

    const where = conditions.join(' AND ')
    const querySql = `
      SELECT doh.DispOrderHeaderId, doh.DispOrderNumber, doh.DispOrderDate, doh.CurrAccTypeCode,
             doh.Company, doh.SourceDispOrderHeaderId, doh.Type, doh.CurrAccCode,
             ec.CurrAccDescription, doh.SubCurrAccId, doh.WarehouseCode, doh.DispOrderStatusId,
             dos.StatusName, doh.FinancialApproval, doh.FinancialApproveDate, doh.StatusDate, doh.WaitReason,
             doh.Amount, doh.Season, doh.Brand, doh.Category, doh.AsnNo,
             doh.DraftPickingListId, doh.RealPickingListId,
             TotalQty = ISNULL(agg.TotalQty, 0),
             TotalAmount = ISNULL(agg.TotalAmt, 0),
             BaseAmount = ISNULL(agg.TotalAmt, doh.Amount),
             ITAtt02 = (SELECT TOP 1 dol.ITAtt02 FROM dbo.DispOrderLine dol WITH (NOLOCK) WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId AND dol.Valid = 1),
             WarehouseDescription = doh.WarehouseCode,
             COUNT(*) OVER() AS _totalCount
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        LEFT JOIN ext.Customer ec ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
        LEFT JOIN dbo.DispOrderStatus dos WITH (NOLOCK) ON dos.StatusId = doh.DispOrderStatusId
        OUTER APPLY (SELECT TotalQty = SUM(dol.Qty1), TotalAmt = SUM(dol.TotalAmount)
                       FROM dbo.DispOrderLine dol WITH (NOLOCK)
                      WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId) agg
       WHERE ${where} ${seasonJoin}
       ORDER BY doh.DispOrderDate DESC
       OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY`

    const result = await request.query(querySql)
    const rawRows = (result.recordset as Record<string, unknown>[]) || []
    const totalCount = rawRows.length > 0 ? (rawRows[0]._totalCount ?? 0) : 0
    const rows = rawRows.map(r => mapDispOrderRow(r)).filter(Boolean) as Record<string, unknown>[]
    sendOk(res, { rows, totalCount })
  })))

  router.get('/api/finance/cari-sevk-ozet', wrapHandler(requireAuth(async (req, res) => {
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const customer = (q.customer || '').trim()
    const contract = (q.contract || '').trim().toLowerCase()
    const statusIdsRaw = (q.statusIds || '').trim()
    const statusIds = statusIdsRaw ? statusIdsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0) : []
    const fromDate = (q.fromDate || '').trim()
    const toDate = (q.toDate || '').trim()
    const season = (q.season || '').trim()
    if (!company || !customer) return sendOk(res, { unapprovedCount: 0, unapprovedQty: 0, unapprovedAmount: 0, approvedCount: 0, approvedQty: 0, approvedAmount: 0, unbilledAmount: 0 })

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req2 = sqlPool.request()
    req2.input('Company', sql.NVarChar(10), company)
    req2.input('Customer', sql.NVarChar(30), customer)
    const conditions = ['doh.Company = @Company', 'doh.CurrAccCode = @Customer', 'doh.Valid = 1']
    if (contract === 'yok') {
      conditions.push("LOWER(LTRIM(RTRIM(ISNULL(ec.Contract, '')))) = N'yok'")
    } else if (contract === 'var') {
      conditions.push("(ec.Contract IS NULL OR LOWER(LTRIM(RTRIM(ec.Contract))) <> N'yok')")
    }
    if (statusIds.length > 0) {
      statusIds.forEach((id, i) => req2.input('StatusId' + i, sql.Int, id))
      conditions.push('doh.DispOrderStatusId IN (' + statusIds.map((_, i) => '@StatusId' + i).join(',') + ')')
    }
    if (fromDate) {
      req2.input('FromDate', sql.Date, fromDate)
      conditions.push('doh.DispOrderDate >= @FromDate')
    }
    if (toDate) {
      req2.input('ToDate', sql.Date, toDate)
      conditions.push('doh.DispOrderDate <= @ToDate')
    }
    let seasonJoin = ''
    if (season) {
      req2.input('Season', sql.NVarChar(50), season)
      seasonJoin = `AND (
        EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId AND dol2.ITAtt02 = @Season)
        OR NOT EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId)
      )`
    }
    const where = conditions.join(' AND ')
    const sqlText = `
      SELECT
        UnapprovedCount = SUM(CASE WHEN doh.DispOrderStatusId <> 2 THEN 1 ELSE 0 END),
        UnapprovedQty   = SUM(CASE WHEN doh.DispOrderStatusId <> 2 THEN ISNULL(agg.TotalQty, 0) ELSE 0 END),
        UnapprovedAmount = SUM(CASE WHEN doh.DispOrderStatusId <> 2 THEN ISNULL(agg.TotalAmt, doh.Amount) ELSE 0 END),
        ApprovedCount   = SUM(CASE WHEN doh.DispOrderStatusId = 2 THEN 1 ELSE 0 END),
        ApprovedQty     = SUM(CASE WHEN doh.DispOrderStatusId = 2 THEN ISNULL(agg.TotalQty, 0) ELSE 0 END),
        ApprovedAmount  = SUM(CASE WHEN doh.DispOrderStatusId = 2 THEN ISNULL(agg.TotalAmt, doh.Amount) ELSE 0 END)
      FROM dbo.DispOrderHeader doh WITH (NOLOCK)
      LEFT JOIN ext.Customer ec ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
      OUTER APPLY (SELECT TotalQty = SUM(dol.Qty1), TotalAmt = SUM(dol.TotalAmount)
                    FROM dbo.DispOrderLine dol WITH (NOLOCK)
                   WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId) agg
      WHERE ${where} ${seasonJoin}
    `
    const result = await req2.query(sqlText)
    const r = ((result.recordset as Record<string, unknown>[]) || [])[0] || {}
    const unapprovedCount = Math.max(0, parseInt(String(r.UnapprovedCount), 10) || 0)
    const unapprovedQty = Math.max(0, parseInt(String(r.UnapprovedQty), 10) || 0)
    const unapprovedAmount = Number(r.UnapprovedAmount) || 0
    const approvedCount = Math.max(0, parseInt(String(r.ApprovedCount), 10) || 0)
    const approvedQty = Math.max(0, parseInt(String(r.ApprovedQty), 10) || 0)
    const approvedAmount = Number(r.ApprovedAmount) || 0
    sendOk(res, {
      unapprovedCount,
      unapprovedQty,
      unapprovedAmount,
      approvedCount,
      approvedQty,
      approvedAmount,
    })
  })))

  router.get('/api/finance/disp-orders/:id/lines', wrapHandler(requireAuth(async (_req, res, params: Record<string, string>) => {
    const headerId = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const result = await sqlPool.request()
      .input('HeaderId', sql.Int, headerId)
      .query(`SELECT dol.DispOrderLineId, dol.ItemCode, dol.ColorCode, dol.ItemDim1Code, dol.ItemDim2Code,
                     dol.Qty1, dol.ShipmentQuantity, dol.BaseListPrice, dol.ListPrice, dol.BaseAmount, dol.TotalAmount, dol.ITAtt02
                FROM dbo.DispOrderLine dol WITH (NOLOCK)
               WHERE dol.DispOrderHeaderId = @HeaderId AND dol.Valid = 1
               ORDER BY dol.ItemCode, dol.ColorCode, dol.ItemDim1Code`)
    const raw = (result.recordset as Record<string, unknown>[]) || []
    const lines = raw.map((row, i) => ({
      lineNo: i + 1,
      itemCode: row.ItemCode ?? '',
      itemName: [row.ItemCode, row.ColorCode].filter(Boolean).join(' / ') || (row.ItemCode ?? ''),
      qty: Number(row.Qty1) || 0,
      unitPrice: Number(row.ListPrice) || 0,
      lineTotal: Number(row.TotalAmount) || 0,
    }))
    sendOk(res, { lines })
  })))

  router.post('/api/finance/disp-orders/ids-by-cari', wrapHandler(requireAuth(async (req, res) => {
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(await readBody(req)) } catch { body = {} }
    const company = String(body.company ?? '').trim()
    const currAccCodes = Array.isArray(body.currAccCodes) ? body.currAccCodes.map(c => String(c ?? '').trim()).filter(Boolean) : []
    if (!company || currAccCodes.length === 0) return sendOk(res, { dispOrderHeaderIds: [] })

    const contract = String(body.contract ?? '').trim().toLowerCase()
    const statusIds = Array.isArray(body.statusIds) ? body.statusIds : (body.statusIds ? String(body.statusIds).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) : [])
    const fromDate = String(body.fromDate ?? '').trim()
    const toDate = String(body.toDate ?? '').trim()
    const season = String(body.season ?? '').trim()
    const asnNoRaw = String(body.asnNo ?? '').trim()
    const orderNoRaw = String(body.orderNo ?? '').trim()
    const asnNos = asnNoRaw ? asnNoRaw.split(',').map(s => String(s).trim()).filter(Boolean).slice(0, 10) : []
    const orderNos = orderNoRaw ? orderNoRaw.split(',').map(s => String(s).trim()).filter(Boolean).slice(0, 300) : []

    const pool = getPool()
    const sqlPool = await pool.getPool()
    const req2 = sqlPool.request()
    req2.input('Company', sql.NVarChar(10), company)

    const conditions = ['doh.Company = @Company', 'doh.Valid = 1']
    const cariPairs = currAccCodes.map((code, i) => {
      req2.input('C' + i, sql.NVarChar(30), code)
      return `(doh.Company = @Company AND doh.CurrAccCode = @C${i})`
    })
    conditions.push('(' + cariPairs.join(' OR ') + ')')
    if (asnNos.length > 0) {
      asnNos.forEach((v, i) => req2.input('AsnNo' + i, sql.NVarChar(100), v))
      conditions.push('doh.AsnNo IN (' + asnNos.map((_, i) => '@AsnNo' + i).join(',') + ')')
    }
    if (orderNos.length > 0) {
      orderNos.forEach((v, i) => req2.input('OrderNo' + i, sql.NVarChar(50), v))
      conditions.push('doh.DispOrderNumber IN (' + orderNos.map((_, i) => '@OrderNo' + i).join(',') + ')')
    }
    if (contract === 'yok') {
      conditions.push("LOWER(LTRIM(RTRIM(ISNULL(ec.Contract, '')))) = N'yok'")
    } else if (contract === 'var') {
      conditions.push("(ec.Contract IS NULL OR LOWER(LTRIM(RTRIM(ec.Contract))) <> N'yok')")
    }
    if (statusIds.length > 0) {
      statusIds.forEach((id, i) => req2.input('StatusId' + i, sql.Int, id))
      conditions.push('doh.DispOrderStatusId IN (' + statusIds.map((_, i) => '@StatusId' + i).join(',') + ')')
    }
    if (fromDate) {
      req2.input('FromDate', sql.Date, fromDate)
      conditions.push('doh.DispOrderDate >= @FromDate')
    }
    if (toDate) {
      req2.input('ToDate', sql.Date, toDate)
      conditions.push('doh.DispOrderDate <= @ToDate')
    }
    let seasonJoin = ''
    if (season) {
      req2.input('Season', sql.NVarChar(50), season)
      seasonJoin = `AND (
        EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId AND dol2.ITAtt02 = @Season)
        OR NOT EXISTS (SELECT 1 FROM dbo.DispOrderLine dol2 WITH (NOLOCK) WHERE dol2.DispOrderHeaderId = doh.DispOrderHeaderId)
      )`
    }
    const where = conditions.join(' AND ')
    const sqlText = `
      SELECT doh.DispOrderHeaderId
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        LEFT JOIN ext.Customer ec ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
       WHERE ${where} ${seasonJoin}
       ORDER BY doh.DispOrderHeaderId
    `
    const result = await req2.query(sqlText)
    const raw = (result.recordset as Record<string, unknown>[]) || []
    const dispOrderHeaderIds = raw.map(r => r.DispOrderHeaderId).filter(id => id != null) as number[]
    sendOk(res, { dispOrderHeaderIds })
  })))

  router.put('/api/finance/disp-orders/approve', wrapHandler(requireAuth(async (req, res) => {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>
    const updates = Array.isArray(body.updates) ? body.updates : []
    if (updates.length === 0) return sendError(res, 400, 'updates array gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const reqUser = (req as IncomingMessage & { user?: Record<string, unknown> }).user
    let updated = 0
    for (const u of updates as Record<string, unknown>[]) {
      const id = u.dispOrderHeaderId != null ? parseInt(String(u.dispOrderHeaderId), 10) : 0
      const statusId = u.statusId != null ? parseInt(String(u.statusId), 10) : null
      const waitReason = u.waitReason != null ? String(u.waitReason).trim() : null
      if (!id || statusId == null) continue
      const request = sqlPool.request()
      request.input('Id', sql.Int, id)
      request.input('StatusId', sql.Int, statusId)
      request.input('WaitReason', sql.NVarChar(512), waitReason)
      request.input('UserId', sql.Int, reqUser?.userId ?? 0)
      await request.query(`
        UPDATE dbo.DispOrderHeader
           SET DispOrderStatusId = @StatusId,
               StatusDate = GETDATE(),
               WaitReason = @WaitReason,
               FinancialApproveDate = IIF(@StatusId IN (2, 3, 4), GETDATE(), FinancialApproveDate),
               FinancialApproveUserId = IIF(@StatusId IN (2, 3, 4), @UserId, FinancialApproveUserId)
         WHERE DispOrderHeaderId = @Id
      `)
      updated++
    }
    sendOk(res, { updated })
  })))

  const COMPANY_DB: Record<string, string> = {
    OLKA: 'OLKAV3',
    MARLIN: 'MARLINV3',
    JUPITER: 'JUPITERV3',
    NEPTUN: 'NEPTUNV3',
    SATURN: 'SaturnV3',
  }

  router.get('/api/finance/customer-summary/:code', wrapHandler(requireAuth(async (req, res, params: Record<string, string>) => {
    const code = (params.code || '').trim()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim().toUpperCase()
    if (!company || !code) return sendError(res, 400, 'company ve code gerekli.')
    const dbName = COMPANY_DB[company]
    if (!dbName) return sendError(res, 400, 'Geçersiz şirket kodu.')

    const pool = getPool()
    const sqlPool = await pool.getPool()

    const execSql = `EXEC [${dbName}].dbo.usp_B2B_GetCurrAccBalanceInfo @CurrAccCode = @Code`
    let row: Record<string, unknown> | null = null
    const debug = (q.debug || '').toString().toLowerCase() === '1' || (q.debug || '').toString().toLowerCase() === 'true'
    try {
      const result = await sqlPool.request()
        .input('Code', sql.NVarChar(30), code)
        .query(execSql)
      let rawRow: Record<string, unknown> | null = null
      const recordsets = result.recordsets as unknown[] | undefined
      if (Array.isArray(recordsets) && recordsets.length > 0) {
        for (const rs of recordsets) {
          if (rs && Array.isArray(rs) && rs.length > 0 && rs[0]) {
            const r = rs[0] as Record<string, unknown>
            if (Object.keys(r).length > 0 || Object.getOwnPropertyNames(r).some(p => p !== 'constructor')) {
              rawRow = r
              break
            }
          }
        }
      }
      if (!rawRow) rawRow = (result.recordset as Record<string, unknown>[])?.[0]
      if (rawRow && typeof rawRow === 'object') {
        row = {}
        for (const k in rawRow) row[k] = rawRow[k]
        if (Object.keys(row).length === 0) {
          for (const k of Object.getOwnPropertyNames(rawRow)) {
            if (k !== 'constructor') row[k] = rawRow[k]
          }
        }
        if (Object.keys(row).length === 0) {
          try {
            row = JSON.parse(JSON.stringify(rawRow))
          } catch (_) {}
        }
        const keys = Object.keys(row as object)
        logger.debug({ code, keys: keys.join(', ') || '(empty)' }, 'finance/customer-summary SP row keys')
      } else {
        row = rawRow
      }
      if (debug && row) {
        const rowSafe = row as Record<string, unknown>
        const entries = Object.keys(rowSafe).map(k => [k, rowSafe[k]] as [string, unknown])
        logger.debug({ code, sample: Object.fromEntries(entries.slice(0, 10)) }, 'finance/customer-summary SP row sample')
      }
    } catch (err) {
      logger.error({ code, err: (err as Error).message || err }, 'finance/customer-summary usp_B2B_GetCurrAccBalanceInfo hatası')
      const errPayload = {
        customerCode: code,
        customerName: '',
        creditLimit: 0,
        balance: 0,
        risk: 0,
        availableCredit: 0,
        overdueAmount: 0,
        avgPaymentDays: 0,
      }
      ;(errPayload as Record<string, unknown>)._error = (err as Error).message || String(err)
      return sendOk(res, errPayload)
    }

    if (!row) {
      return sendOk(res, {
        customerCode: code,
        customerName: '',
        creditLimit: 0,
        balance: 0,
        risk: 0,
        availableCredit: 0,
        overdueAmount: 0,
        avgPaymentDays: 0,
      })
    }

    const num = (v: unknown) => (v != null && v !== '' ? Number(v) : NaN)
    const n = (v: unknown, def = 0) => { const x = num(v); return Number.isFinite(x) ? x : def }
    const norm = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    const keyMap: Record<string, string> = {}
    const rowKeys = row && typeof row === 'object' ? Object.keys(row) : []
    for (const key of rowKeys) {
      keyMap[norm(key)] = key
    }
    const get = (r: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        let v = r[k]
        if (v != null && v !== '') return v
        const nk = norm(k)
        const actualKey = keyMap[nk]
        if (actualKey != null) { v = r[actualKey]; if (v != null && v !== '') return v }
      }
      return undefined
    }
    const getByPartial = (r: Record<string, unknown>, ...termGroups: (string | string[])[]): unknown => {
      for (const terms of termGroups) {
        const t = (Array.isArray(terms) ? terms : [terms]).map(x => norm(String(x)))
        for (const key of rowKeys) {
          const nk = norm(key)
          if (t.every(term => nk.includes(term))) {
            const v = r[key]
            if (v != null && v !== '') return v
          }
        }
      }
      return undefined
    }

    const creditLimit = n(get(row, 'CreditLimit', 'KrediLimiti', 'Kredi Limiti', 'Siparis Tutari', 'SiparisTutari') ?? getByPartial(row, ['kredi', 'limiti']))
    const balance = n(get(row, 'Hesap Bakiyesi', 'HesapBakiyesi', 'Balance', 'Bakiye', 'Fatura Tutari', 'FaturaTutari') ?? getByPartial(row, ['hesap', 'bakiyesi'], ['bakiye']))
    const risk = n(get(row, 'Teminat Riski', 'TeminatRiski', 'Risk', 'Teminat Mektubu Tutari', 'TeminatMektubuTutari', 'TeminatDBS') ?? getByPartial(row, ['teminat', 'riski'], ['teminat']))
    const availableCreditVal = get(row, 'AvailableCredit', 'KullanilabilirKredi', 'Kullanılabilir Kredi')
    const hasAvailableCredit = availableCreditVal != null && availableCreditVal !== ''
    const availableCredit = hasAvailableCredit ? n(availableCreditVal) : (creditLimit - balance)
    let customerName = String(get(row, 'CurrAccDescription', 'CustomerName', 'MusteriAdi', 'Müşteri Adı', 'Cari Adı') ?? '').trim()
    if (!customerName) {
      try {
        const db = process.env.DB_NAME || 'OrcaAlokasyon'
        const nameReq = sqlPool.request()
        nameReq.input('Company', sql.NVarChar(10), company)
        nameReq.input('CurrAccCode', sql.NVarChar(30), code)
        const nameRes = await nameReq.query(`
          SELECT TOP 1 CurrAccDescription FROM [${db}].ext.Customer WITH (NOLOCK)
          WHERE Company = @Company AND CurrAccCode = @CurrAccCode
        `)
        const nameRow = (nameRes.recordset as Record<string, unknown>[])?.[0]
        if (nameRow && (nameRow.CurrAccDescription != null && nameRow.CurrAccDescription !== '')) {
          customerName = String(nameRow.CurrAccDescription).trim()
        }
      } catch (e) {
        logger.error({ code, err: (e as Error).message || e }, 'finance/customer-summary ext.Customer name lookup hatası')
      }
    }

    const avgPaymentDays = n(get(row, 'Vade', 'AvgPaymentDays', 'OrtOdemeSuresi', 'Ort. Ödeme Süresi') ?? getByPartial(row, ['vade']))
    const workingMethod = String(get(row, 'Calisma Yontemi', 'CalismaYontemi', 'WorkingMethod') ?? getByPartial(row, ['calisma', 'yontemi']) ?? '').trim()
    const workingMethodCode = String(get(row, 'Calisma Yontemi Kodu', 'CalismaYontemiKodu') ?? getByPartial(row, ['calisma', 'yontemi', 'kodu']) ?? '').trim()
    const letterOfGuaranteeEarliestDue = get(row, 'Teminat Mektubu En Erken Vade', 'TeminatMektubuEnErkenVade') ?? getByPartial(row, ['teminat', 'erken', 'vade'])
    const dateStr = (v: unknown) => (v == null || v === '' ? null : new Date(v as string | number).toISOString().slice(0, 10))
    const teminatMektubuTutari = n(get(row, 'Teminat Mektubu Tutari', 'TeminatMektubuTutari', 'TeminatDBS') ?? getByPartial(row, ['teminat', 'mektubu', 'tutari'], ['teminatdbs']))
    const alinanCekAktifSezon = n(get(row, 'AlinanCek Toplami Aktif Sezon', 'AlinanCekToplamiAktifSezon') ?? getByPartial(row, ['alinan', 'cek', 'aktif']))
    const alinanCekEskiezon = n(get(row, 'AlinanCek Toplami Eskiezon', 'AlinanCekToplamiEskiezon') ?? getByPartial(row, ['alinan', 'cek', 'eskiezon']))
    const sevkiyatTemin = n(get(row, 'Sevkiyat Temin', 'Sevkiyat Teminat Yuzdesi', 'SevkiyatTemin') ?? getByPartial(row, ['sevkiyat', 'teminat']))
    const kalanSiparisBakiyesi = n(get(row, 'Kalan Siparis Bakiyesi', 'KalanSiparisBakiyesi') ?? getByPartial(row, ['kalan', 'siparis']))

    const payload: Record<string, unknown> = {
      customerCode: code,
      customerName,
      creditLimit,
      balance,
      risk,
      availableCredit,
      overdueAmount: n(get(row, 'OverdueAmount', 'VadesiGecmis', 'Vadesi Geçmiş')),
      avgPaymentDays,
      workingMethod,
      workingMethodCode,
      letterOfGuaranteeEarliestDue: dateStr(letterOfGuaranteeEarliestDue),
      teminatMektubuTutari,
      alinanCekAktifSezon,
      alinanCekEskiezon,
      sevkiyatTemin,
      kalanSiparisBakiyesi,
    }
    if (debug) (payload as Record<string, unknown>)._debug = { rowKeys, keyMap }
    sendOk(res, payload)
  })))
}
