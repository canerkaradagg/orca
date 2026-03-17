const { getPool } = require('../../db/connection-pool.cjs')
const sql = require('mssql')
const { getQueryParams, sendOk, sendError, wrapHandler } = require('../middleware.cjs')
const { requireAuth } = require('../auth-middleware.cjs')

function register(router) {

  router.get('/api/reports/disp-order-process', wrapHandler(requireAuth(async (req, res) => {
    const pool = getPool()
    const sqlPool = await pool.getPool()
    const q = getQueryParams(req.url)
    const company = (q.company || '').trim()
    const customer = (q.customer || '*').trim()
    const season = (q.season || '').trim()
    const asnNo = (q.asnNo || '').trim()
    const sevkNo = (q.sevkNo || '').trim()
    const page = Math.max(1, parseInt(q.page, 10) || 1)
    const pageSize = Math.min(500, Math.max(1, parseInt(q.pageSize, 10) || 100))
    const offset = (page - 1) * pageSize

    if (!company) return sendError(res, 400, 'company gerekli.')

    const request = sqlPool.request()
    request.input('Company', sql.NVarChar(10), company)
    request.input('Customer', sql.NVarChar(30), customer)
    request.input('Season', sql.NVarChar(50), season)
    request.input('AsnNo', sql.NVarChar(sql.MAX), asnNo)
    request.input('SevkNo', sql.NVarChar(sql.MAX), sevkNo)
    request.input('Offset', sql.Int, offset)
    request.input('PageSize', sql.Int, pageSize)

    const result = await request.query(`
      SELECT doh.Company, doh.DispOrderNumber, doh.DispOrderDate, doh.CurrAccTypeCode, doh.CurrAccCode,
             ec.CurrAccDescription,
             doh.WarehouseCode,
             ew.WarehouseDescription AS WarehouseDesc,
             doh.FinancialApproval, ec.CustomerApproval, ec.SASRequest,
             doh.FinancialApproveDate,
             FinancialApproveRequestDate = doh.ApproveSentDate,
             FinancialApproveDuration = DATEDIFF(HOUR, doh.ApproveSentDate, doh.FinancialApproveDate),
             FinancialApproveStatus = CASE
               WHEN doh.FinancialApproval = 0 THEN N'Onay Yok'
               WHEN doh.FinancialApproveDate IS NOT NULL THEN N'Onaylandı'
               WHEN doh.ApproveSentDate IS NOT NULL THEN N'Bekliyor'
               ELSE N'Gönderilmedi' END,
             DealerApproveRequestDate = doh.ApproveSentDate,
             DealerApproveDate = dpl.ApproveDate,
             DealerApproveDuration = DATEDIFF(HOUR, doh.ApproveSentDate, dpl.ApproveDate),
             DealerApproveStatus = CASE
               WHEN ec.CustomerApproval = 0 THEN N'Onay Yok'
               WHEN dpl.ApproveDate IS NOT NULL THEN dpls.Status
               WHEN doh.ApproveSentDate IS NOT NULL THEN N'Bekliyor'
               ELSE N'Gönderilmedi' END,
             doh.CollectedDate,
             SasApproveRequestDate = doh.SasSentDate,
             SasApproveDate = rpl.ApproveDate,
             SasApproveDuration = DATEDIFF(HOUR, doh.SasSentDate, rpl.ApproveDate),
             SasApproveStatus = CASE
               WHEN ec.SASRequest = 0 THEN N'SAS Yok'
               WHEN rpl.ApproveDate IS NOT NULL THEN rpls.Status
               WHEN doh.SasSentDate IS NOT NULL THEN N'Bekliyor'
               ELSE N'Gönderilmedi' END,
             Quantity = ISNULL(agg.TotalQty, 0),
             ShipmentQuantity = ISNULL(agg.TotalShipment, 0),
             doh.Type, doh.WarehouseStatus, dos.StatusName AS DispOrderStatus,
             doh.WaitReason, doh.Season, doh.Brand, doh.Category,
             SipRefNo = doh.AsnNo,
             COUNT(*) OVER() AS _totalCount
        FROM dbo.DispOrderHeader doh WITH (NOLOCK)
        LEFT JOIN ext.Customer ec ON ec.CurrAccCode = doh.CurrAccCode AND ec.CurrAccTypeCode = doh.CurrAccTypeCode
        LEFT JOIN dbo.cdWarehouse ew ON ew.WarehouseCode = doh.WarehouseCode AND ew.Company = doh.Company
        LEFT JOIN dbo.DispOrderStatus dos WITH (NOLOCK) ON dos.StatusId = doh.DispOrderStatusId
        LEFT JOIN dbo.PickingLists dpl WITH (NOLOCK) ON dpl.PickingListId = doh.DraftPickingListId
        LEFT JOIN dbo.PickingListStatus dpls ON dpls.StatusId = dpl.Status
        LEFT JOIN dbo.PickingLists rpl WITH (NOLOCK) ON rpl.PickingListId = doh.RealPickingListId
        LEFT JOIN dbo.PickingListStatus rpls ON rpls.StatusId = rpl.Status
        OUTER APPLY (SELECT TotalQty = SUM(dol.Qty1), TotalShipment = SUM(dol.ShipmentQuantity)
                       FROM dbo.DispOrderLine dol WITH (NOLOCK)
                      WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId) agg
       WHERE doh.Company = @Company AND doh.Valid = 1
         AND (@Customer = '*' OR doh.CurrAccCode = @Customer)
         AND (@AsnNo = '' OR doh.AsnNo LIKE '%' + @AsnNo + '%')
         AND (@SevkNo = '' OR doh.DispOrderNumber LIKE '%' + @SevkNo + '%')
         AND (@Season = '' OR EXISTS (SELECT 1 FROM dbo.DispOrderLine s WITH (NOLOCK) WHERE s.DispOrderHeaderId = doh.DispOrderHeaderId AND s.ITAtt02 = @Season))
         AND NOT EXISTS (SELECT 1 FROM dbo.ReportException re WHERE re.Company = doh.Company AND re.CurrAccCode = doh.CurrAccCode)
       ORDER BY doh.DispOrderDate DESC
       OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `)
    const rows = result.recordset || []
    sendOk(res, { rows, totalCount: rows.length > 0 ? (rows[0]._totalCount ?? 0) : 0 })
  })))
}

module.exports = { register }
