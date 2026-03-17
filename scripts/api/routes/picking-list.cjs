const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { readBody, getQueryParams, sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const { requireAuth } = require('../auth-middleware.cjs')

function register(router) {

  router.get('/api/picking-lists', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const customer = (q.customer || '').trim()
    const status = (q.status || '').trim()
    const fromDate = (q.fromDate || '').trim()
    const toDate = (q.toDate || '').trim()
    const page = Math.max(1, parseInt(q.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20))
    const offset = (page - 1) * pageSize

    const request = sqlPool.request()
    request.input('Offset', sql.Int, offset)
    request.input('PageSize', sql.Int, pageSize)
    const conditions = []

    if (company) { request.input('Company', sql.NVarChar(10), company); conditions.push('pl.Company = @Company') }
    if (customer) { request.input('Customer', sql.VarChar(30), customer); conditions.push('pl.CustomerCode = @Customer') }
    if (status) { request.input('Status', sql.TinyInt, parseInt(status, 10)); conditions.push('pl.Status = @Status') }
    if (fromDate) { request.input('From', sql.Date, fromDate); conditions.push('CAST(pl.CreatedTime AS DATE) >= @From') }
    if (toDate) { request.input('To', sql.Date, toDate); conditions.push('CAST(pl.CreatedTime AS DATE) <= @To') }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const result = await request.query(`
      SELECT pl.PickingListId, pl.ListType, pl.PickingDate, pl.Company, pl.CustomerCode,
             ec.CurrAccDescription AS CustomerName, pl.Status, pls.Status AS StatusName,
             pl.CreatedTime, pl.SingleWaybill, pl.ApproveDate, pl.RejectDate, pl.CancelDate,
             u.DisplayName AS CreatedByName,
             OrderCount = (SELECT COUNT(*) FROM dbo.DispOrderHeader doh WITH (NOLOCK) WHERE doh.DraftPickingListId = pl.PickingListId OR doh.RealPickingListId = pl.PickingListId),
             COUNT(*) OVER() AS _totalCount
        FROM dbo.PickingLists pl WITH (NOLOCK)
        LEFT JOIN ext.Customer ec ON ec.CurrAccCode = pl.CustomerCode AND ec.Company = pl.Company
        LEFT JOIN dbo.PickingListStatus pls ON pls.StatusId = pl.Status
        LEFT JOIN dbo.Users u ON u.UserId = pl.CreatedUserId
       ${where}
       ORDER BY pl.CreatedTime DESC
       OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `)
    const raw = result.recordset || []
    const totalCount = raw.length > 0 ? (raw[0]._totalCount ?? 0) : 0
    const rows = raw.map(r => ({
      id: r.PickingListId,
      listeNo: String(r.PickingListId),
      tarih: r.CreatedTime ? new Date(r.CreatedTime).toISOString().slice(0, 10) : '',
      firma: r.Company || '',
      musteri: r.CustomerName || r.CustomerCode || '',
      durum: r.Status,
      siparisSayisi: r.OrderCount ?? 0,
      olusturan: r.CreatedByName || '',
      olusturmaZamani: r.CreatedTime ? new Date(r.CreatedTime).toLocaleString('tr-TR') : '',
      listType: r.ListType,
    }))
    sendOk(res, { rows, totalCount })
  })))

  router.post('/api/picking-lists', wrapHandler(requireAuth(async (req, res) => {
    const body = JSON.parse(await readBody(req))
    const company = (body.company || '').trim()
    const customerCode = (body.customerCode || '').trim()
    const listType = body.listType != null ? parseInt(body.listType, 10) : 1
    const singleWaybill = !!body.singleWaybill
    const dispOrderIds = Array.isArray(body.dispOrderIds) ? body.dispOrderIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)) : []
    if (!company || !customerCode || dispOrderIds.length === 0) return sendError(res, 400, 'company, customerCode ve dispOrderIds gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const insResult = await sqlPool.request()
      .input('ListType', sql.TinyInt, listType)
      .input('Company', sql.NVarChar(10), company)
      .input('CustomerCode', sql.VarChar(30), customerCode)
      .input('SingleWaybill', sql.Bit, singleWaybill ? 1 : 0)
      .input('UserId', sql.Int, req.user.userId)
      .query(`INSERT INTO dbo.PickingLists (ListType, PickingDate, Company, CustomerCode, Status, CreatedUserId, SingleWaybill)
              OUTPUT INSERTED.PickingListId
              VALUES (@ListType, GETDATE(), @Company, @CustomerCode, 1, @UserId, @SingleWaybill)`)
    const pickingListId = insResult.recordset?.[0]?.PickingListId
    if (!pickingListId) return sendError(res, 500, 'Çeki listesi oluşturulamadı.')
    const col = listType === 2 ? 'RealPickingListId' : 'DraftPickingListId'
    for (const id of dispOrderIds) {
      await sqlPool.request()
        .input('PlId', sql.Int, pickingListId)
        .input('DohId', sql.Int, id)
        .query(`UPDATE dbo.DispOrderHeader SET ${col} = @PlId WHERE DispOrderHeaderId = @DohId`)
    }
    sendOk(res, { pickingListId, orderCount: dispOrderIds.length })
  })))

  router.get('/api/picking-lists/:id', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const plResult = await sqlPool.request().input('Id', sql.Int, id).query(`
      SELECT pl.*, pls.Status AS StatusName, ec.CurrAccDescription AS CustomerName, u.DisplayName AS CreatedByName
        FROM dbo.PickingLists pl WITH (NOLOCK)
        LEFT JOIN dbo.PickingListStatus pls ON pls.StatusId = pl.Status
        LEFT JOIN ext.Customer ec ON ec.CurrAccCode = pl.CustomerCode
        LEFT JOIN dbo.Users u ON u.UserId = pl.CreatedUserId
       WHERE pl.PickingListId = @Id
    `)
    const pickingList = plResult.recordset?.[0]
    if (!pickingList) return sendError(res, 404, 'Çeki listesi bulunamadı.')
    const ordersResult = await sqlPool.request().input('Id', sql.Int, id).query(`
      SELECT doh.DispOrderHeaderId, doh.DispOrderNumber, doh.DispOrderDate, doh.CurrAccCode, doh.WarehouseCode,
             doh.CustomerSASNo,
             TotalQty = ISNULL(agg.TotalQty, 0), TotalAmount = ISNULL(agg.TotalAmt, 0)
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        OUTER APPLY (SELECT TotalQty = SUM(Qty1), TotalAmt = SUM(TotalAmount) FROM dbo.DispOrderLine WITH (NOLOCK) WHERE DispOrderHeaderId = doh.DispOrderHeaderId) agg
       WHERE doh.DraftPickingListId = @Id OR doh.RealPickingListId = @Id
       ORDER BY doh.DispOrderNumber
    `)
    let cases = []
    if (pickingList.ListType === 2) {
      const casesResult = await sqlPool.request().input('Id', sql.Int, id).query(`
        SELECT c.DispOrderCaseId, c.DispOrderHeaderId, c.CaseCode, c.CustomerSASNo, doh.DispOrderNumber
          FROM dbo.DispOrderCase c WITH (NOLOCK)
          INNER JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.DispOrderHeaderId = c.DispOrderHeaderId AND (doh.RealPickingListId = @Id)
         ORDER BY doh.DispOrderNumber, c.DispOrderCaseId
      `)
      cases = casesResult.recordset || []
    }
    sendOk(res, { pickingList, orders: ordersResult.recordset || [], cases })
  })))

  router.post('/api/picking-lists/:id/send', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('Id', sql.Int, id)
      .query("UPDATE dbo.PickingLists SET Status = 2 WHERE PickingListId = @Id AND Status = 1")
    sendOk(res)
  })))

  router.post('/api/picking-lists/:id/approve', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const pl = await sqlPool.request().input('Id', sql.Int, id).query(`
      SELECT PickingListId, ListType, SingleWaybill FROM dbo.PickingLists WITH (NOLOCK) WHERE PickingListId = @Id AND Status = 2
    `)
    const list = pl.recordset?.[0]
    if (!list) return sendError(res, 404, 'Çeki listesi bulunamadı veya onay bekliyor durumunda değil.')
    if (list.ListType === 2) {
      if (list.SingleWaybill) {
        const missing = await sqlPool.request().input('Id', sql.Int, id).query(`
          SELECT 1 FROM dbo.DispOrderHeader WITH (NOLOCK)
           WHERE RealPickingListId = @Id AND (CustomerSASNo IS NULL OR RTRIM(CustomerSASNo) = '')
        `)
        if ((missing.recordset || []).length > 0) return sendError(res, 400, 'SAS listesinde tüm sevk emirlerinin SAS no girişi yapılmış olmalıdır.')
      } else {
        const missing = await sqlPool.request().input('Id', sql.Int, id).query(`
          SELECT 1 FROM dbo.DispOrderCase c WITH (NOLOCK)
          INNER JOIN dbo.DispOrderHeader h WITH (NOLOCK) ON h.DispOrderHeaderId = c.DispOrderHeaderId AND h.RealPickingListId = @Id
           WHERE c.CustomerSASNo IS NULL OR RTRIM(c.CustomerSASNo) = ''
        `)
        if ((missing.recordset || []).length > 0) return sendError(res, 400, 'SAS listesinde tüm kolilerin SAS no girişi yapılmış olmalıdır.')
      }
      // WMS'e müşteri onayı + SAS gönderimi: placeholder (gerçek entegrasyon sonra eklenecek)
      // await sendCustomerApprovalAndSASToWMS(id)
    }
    await sqlPool.request().input('Id', sql.Int, id)
      .query("UPDATE dbo.PickingLists SET Status = 3, ApproveDate = GETDATE() WHERE PickingListId = @Id AND Status = 2")
    sendOk(res)
  })))

  router.post('/api/picking-lists/:id/reject', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const note = (body.note || '').trim()
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('Id', sql.Int, id).input('Note', sql.NVarChar(sql.MAX), note)
      .query("UPDATE dbo.PickingLists SET Status = 4, RejectDate = GETDATE(), CustomerNote = @Note WHERE PickingListId = @Id AND Status = 2")
    sendOk(res)
  })))

  router.post('/api/picking-lists/:id/cancel', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const pool = getPool()
    const sqlPool = await pool.getPool()
    await sqlPool.request().input('Id', sql.Int, id)
      .query("UPDATE dbo.PickingLists SET Status = 5, CancelDate = GETDATE() WHERE PickingListId = @Id")
    await sqlPool.request().input('Id', sql.Int, id)
      .query("UPDATE dbo.DispOrderHeader SET DraftPickingListId = NULL WHERE DraftPickingListId = @Id")
    await sqlPool.request().input('Id', sql.Int, id)
      .query("UPDATE dbo.DispOrderHeader SET RealPickingListId = NULL WHERE RealPickingListId = @Id")
    sendOk(res)
  })))

  router.get('/api/picking-lists/disp-orders', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const customer = (q.customer || '').trim()
    const listType = parseInt(q.listType, 10) || 1
    const fromDate = (q.fromDate || '').trim()
    const toDate = (q.toDate || '').trim()
    if (!company || !customer) return sendOk(res, { rows: [] })
    const col = listType === 2 ? 'RealPickingListId' : 'DraftPickingListId'
    const request = sqlPool.request()
      .input('Company', sql.NVarChar(10), company)
      .input('Customer', sql.NVarChar(30), customer)
    let whereExtra = ''
    if (listType === 1) {
      whereExtra = ' AND ec.CustomerApproval = 1'
    } else {
      whereExtra = ' AND ec.SASRequest = 1'
      // Kolileme bitti kontrolü WMS entegrasyonunda IsCollected/WarehouseStatus ile yapılacak; şimdilik tüm SAS talepli sevkler listelenir
    }
    if (fromDate) {
      request.input('FromDate', sql.Date, fromDate)
      whereExtra += ' AND CAST(doh.DispOrderDate AS DATE) >= @FromDate'
    }
    if (toDate) {
      request.input('ToDate', sql.Date, toDate)
      whereExtra += ' AND CAST(doh.DispOrderDate AS DATE) <= @ToDate'
    }
    const result = await request.query(`
      SELECT doh.DispOrderHeaderId, doh.DispOrderNumber, doh.DispOrderDate, doh.WarehouseCode,
             doh.DispOrderStatusId, dos.StatusName, doh.Amount,
             TotalQty = ISNULL(agg.TotalQty, 0), TotalAmount = ISNULL(agg.TotalAmt, 0)
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        LEFT JOIN ext.Customer ec WITH (NOLOCK) ON ec.Company = doh.Company AND ec.CurrAccCode = doh.CurrAccCode
        LEFT JOIN dbo.DispOrderStatus dos WITH (NOLOCK) ON dos.StatusId = doh.DispOrderStatusId
        OUTER APPLY (SELECT TotalQty = SUM(Qty1), TotalAmt = SUM(TotalAmount) FROM dbo.DispOrderLine WITH (NOLOCK) WHERE DispOrderHeaderId = doh.DispOrderHeaderId) agg
       WHERE doh.Company = @Company AND doh.CurrAccCode = @Customer AND doh.Valid = 1
         AND doh.${col} IS NULL
         ${whereExtra}
       ORDER BY doh.DispOrderDate DESC
    `)
    sendOk(res, { rows: result.recordset || [] })
  })))

  router.post('/api/picking-lists/:id/sas', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const singleWaybill = !!body.singleWaybill
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) return sendError(res, 400, 'En az bir kayıt gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const pl = await sqlPool.request().input('Id', sql.Int, id).query(`
      SELECT PickingListId, ListType, SingleWaybill FROM dbo.PickingLists WITH (NOLOCK) WHERE PickingListId = @Id
    `)
    const list = pl.recordset?.[0]
    if (!list || list.ListType !== 2) return sendError(res, 400, 'SAS sadece SAS talebi (ListType=2) listelerde kaydedilir.')
    const col = list.ListType === 2 ? 'RealPickingListId' : 'DraftPickingListId'
    if (singleWaybill) {
      const headerIds = items.map(i => parseInt(i.dispOrderHeaderId, 10)).filter(n => !isNaN(n))
      const sasMap = new Map(items.map(i => [parseInt(i.dispOrderHeaderId, 10), (i.customerSASNo || '').trim()]))
      if (headerIds.length === 0) return sendError(res, 400, 'Geçerli sevk emri id gerekli.')
      const belongs = await sqlPool.request()
        .input('Id', sql.Int, id)
        .input('Ids', sql.NVarChar(500), headerIds.join(','))
        .query(`SELECT DispOrderHeaderId FROM dbo.DispOrderHeader WITH (NOLOCK) WHERE ${col} = @Id AND DispOrderHeaderId IN (SELECT value FROM STRING_SPLIT(@Ids, ','))`)
      const allowedIds = new Set((belongs.recordset || []).map(r => r.DispOrderHeaderId))
      const duplicates = new Map()
      for (const [hid, no] of sasMap) {
        if (!no) continue
        const prev = duplicates.get(no)
        if (prev !== undefined && prev !== hid) return sendError(res, 400, 'Aynı SAS no birden fazla sevk emrine verilemez.')
        duplicates.set(no, hid)
      }
      for (const hid of headerIds) {
        if (!allowedIds.has(hid)) continue
        const sasNo = sasMap.get(hid) || ''
        await sqlPool.request()
          .input('SasNo', sql.NVarChar(50), sasNo)
          .input('DohId', sql.Int, hid)
          .query('UPDATE dbo.DispOrderHeader SET CustomerSASNo = NULLIF(@SasNo, \'\') WHERE DispOrderHeaderId = @DohId')
      }
    } else {
      const caseIds = items.map(i => parseInt(i.dispOrderCaseId, 10)).filter(n => !isNaN(n))
      const sasMap = new Map(items.map(i => [parseInt(i.dispOrderCaseId, 10), (i.customerSASNo || '').trim()]))
      if (caseIds.length === 0) return sendError(res, 400, 'Geçerli koli id gerekli.')
      const caseIdsParam = caseIds.join(',')
      const belongsResult = await sqlPool.request()
        .input('Id', sql.Int, id)
        .input('CaseIds', sql.NVarChar(1000), caseIdsParam)
        .query(`
          SELECT c.DispOrderCaseId FROM dbo.DispOrderCase c WITH (NOLOCK)
          INNER JOIN dbo.DispOrderHeader h WITH (NOLOCK) ON h.DispOrderHeaderId = c.DispOrderHeaderId AND h.RealPickingListId = @Id
          WHERE c.DispOrderCaseId IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@CaseIds, ',') WHERE TRY_CAST(value AS INT) IS NOT NULL)
        `)
      const allowedCaseIds = new Set((belongsResult.recordset || []).map(r => r.DispOrderCaseId))
      const duplicates = new Map()
      for (const [cid, no] of sasMap) {
        if (!no) continue
        const prev = duplicates.get(no)
        if (prev !== undefined && prev !== cid) return sendError(res, 400, 'Aynı SAS no birden fazla kolide kullanılamaz.')
        duplicates.set(no, cid)
      }
      for (const cid of caseIds) {
        if (!allowedCaseIds.has(cid)) continue
        const sasNo = sasMap.get(cid) || ''
        await sqlPool.request()
          .input('SasNo', sql.NVarChar(50), sasNo)
          .input('Cid', sql.Int, cid)
          .query('UPDATE dbo.DispOrderCase SET CustomerSASNo = NULLIF(@SasNo, \'\') WHERE DispOrderCaseId = @Cid')
      }
    }
    sendOk(res, { ok: true })
  })))

  router.post('/api/picking-lists/:id/upload-cases', wrapHandler(requireAuth(async (req, res, params) => {
    const id = parseInt(params.id, 10)
    const body = JSON.parse(await readBody(req))
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) return sendError(res, 400, 'Excel verisi (rows) gerekli.')
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const pl = await sqlPool.request().input('Id', sql.Int, id).query(`
      SELECT PickingListId, ListType, SingleWaybill FROM dbo.PickingLists WITH (NOLOCK) WHERE PickingListId = @Id
    `)
    const list = pl.recordset?.[0]
    if (!list || list.ListType !== 2) return sendError(res, 400, 'Toplu SAS yükleme sadece SAS talebi listelerde kullanılır.')
    const singleWaybill = !!list.SingleWaybill
    const items = singleWaybill
      ? rows.map(r => ({ dispOrderHeaderId: parseInt(r.dispOrderHeaderId, 10), customerSASNo: (r.customerSASNo || '').trim() })).filter(i => !isNaN(i.dispOrderHeaderId))
      : rows.map(r => ({ dispOrderCaseId: parseInt(r.dispOrderCaseId, 10), customerSASNo: (r.customerSASNo || '').trim() })).filter(i => !isNaN(i.dispOrderCaseId))
    if (items.length === 0) return sendError(res, 400, 'Geçerli satır bulunamadı.')
    const col = 'RealPickingListId'
    if (singleWaybill) {
      const headerIds = items.map(i => i.dispOrderHeaderId)
      const sasMap = new Map(items.map(i => [i.dispOrderHeaderId, i.customerSASNo]))
      const belongsResult = await sqlPool.request()
        .input('Id', sql.Int, id)
        .input('Ids', sql.NVarChar(500), headerIds.join(','))
        .query(`SELECT DispOrderHeaderId FROM dbo.DispOrderHeader WITH (NOLOCK) WHERE ${col} = @Id AND DispOrderHeaderId IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@Ids, ',') WHERE TRY_CAST(value AS INT) IS NOT NULL)`)
      const allowedIds = new Set((belongsResult.recordset || []).map(r => r.DispOrderHeaderId))
      const seenSas = new Map()
      for (const [hid, no] of sasMap) {
        if (!no) continue
        if (seenSas.has(no) && seenSas.get(no) !== hid) return sendError(res, 400, 'Aynı SAS no birden fazla sevk emrine verilemez.')
        seenSas.set(no, hid)
      }
      for (const hid of headerIds) {
        if (!allowedIds.has(hid)) continue
        const sasNo = sasMap.get(hid) || ''
        await sqlPool.request()
          .input('SasNo', sql.NVarChar(50), sasNo)
          .input('DohId', sql.Int, hid)
          .query('UPDATE dbo.DispOrderHeader SET CustomerSASNo = NULLIF(@SasNo, \'\') WHERE DispOrderHeaderId = @DohId')
      }
    } else {
      const caseIds = items.map(i => i.dispOrderCaseId)
      const sasMap = new Map(items.map(i => [i.dispOrderCaseId, i.customerSASNo]))
      const belongsResult = await sqlPool.request()
        .input('Id', sql.Int, id)
        .input('CaseIds', sql.NVarChar(1000), caseIds.join(','))
        .query(`
          SELECT c.DispOrderCaseId FROM dbo.DispOrderCase c WITH (NOLOCK)
          INNER JOIN dbo.DispOrderHeader h WITH (NOLOCK) ON h.DispOrderHeaderId = c.DispOrderHeaderId AND h.RealPickingListId = @Id
          WHERE c.DispOrderCaseId IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@CaseIds, ',') WHERE TRY_CAST(value AS INT) IS NOT NULL)
        `)
      const allowedCaseIds = new Set((belongsResult.recordset || []).map(r => r.DispOrderCaseId))
      const seenSas = new Map()
      for (const [cid, no] of sasMap) {
        if (!no) continue
        if (seenSas.has(no) && seenSas.get(no) !== cid) return sendError(res, 400, 'Aynı SAS no birden fazla kolide kullanılamaz.')
        seenSas.set(no, cid)
      }
      for (const cid of caseIds) {
        if (!allowedCaseIds.has(cid)) continue
        const sasNo = sasMap.get(cid) || ''
        await sqlPool.request()
          .input('SasNo', sql.NVarChar(50), sasNo)
          .input('Cid', sql.Int, cid)
          .query('UPDATE dbo.DispOrderCase SET CustomerSASNo = NULLIF(@SasNo, \'\') WHERE DispOrderCaseId = @Cid')
      }
    }
    sendOk(res, { ok: true, processed: items.length })
  })))
}

module.exports = { register }
