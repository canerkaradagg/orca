-- ============================================================
-- ORCA ASN Portalı – Liste view'ları (vw_InboundList, vw_AsnStatus, vw_OpenOrderSummary)
-- ============================================================

USE [OrcaAlokasyon]
GO

CREATE OR ALTER VIEW dbo.vw_InboundList AS
SELECT
    i.InboundId,
    i.CompanyCode,
    i.WarehouseCode,
    COALESCE(NULLIF(LTRIM(RTRIM(w.WarehouseDescription)),''), i.WarehouseCode) AS WarehouseDescription,
    i.VendorCode,
    COALESCE(NULLIF(LTRIM(RTRIM(v.CurrAccDescription)),''), i.VendorCode)      AS VendorDescription,
    i.Status,
    i.ImportFileNumber,
    i.InProgress,
    COALESCE(a.AsnNo, '')   AS AsnNo,
    i.FileName,
    i.CreatedTime,
    COALESCE(i.CreatedUserId,'') AS CreatedUserId
FROM dbo.Inbound i
LEFT JOIN dbo.InboundAsn a
    ON a.InboundId = i.InboundId
LEFT JOIN dbo.cdWarehouse w
    ON LTRIM(RTRIM(CAST(w.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode))
   AND w.WarehouseCode = i.WarehouseCode
LEFT JOIN dbo.Vendor v
    ON LTRIM(RTRIM(CAST(v.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode))
   AND LTRIM(RTRIM(v.CurrAccCode)) = LTRIM(RTRIM(i.VendorCode));
GO

CREATE OR ALTER VIEW dbo.vw_AsnStatus AS
SELECT
    i.InboundId,
    i.Status,
    COALESCE(a.AsnNo,'')   AS AsnNo,
    a.IsAllocation,
    x.RequestCount,
    x.CompletedRequestCount,
    x.AllocatedDate
FROM dbo.Inbound i
LEFT JOIN dbo.InboundAsn a ON a.InboundId = i.InboundId
OUTER APPLY (
    SELECT
        RequestCount          = COUNT(*),
        CompletedRequestCount = SUM(IIF(r.CompletedDate IS NOT NULL OR r.AllocatedDate IS NOT NULL, 1, 0)),
        AllocatedDate         = MAX(r.AllocatedDate)
    FROM dbo.Request r
    WHERE r.InboundAsnId = a.InboundAsnId
) x;
GO

CREATE OR ALTER VIEW dbo.vw_OpenOrderSummary AS
SELECT
    i.CompanyCode,
    i.VendorCode,
    il.Barcode,
    il.PONumber,
    TotalReservedQty = SUM(il.Quantity)
FROM dbo.Inbound i
JOIN dbo.InboundLine il ON il.InboundId = i.InboundId
WHERE i.Status = 'Taslak'
  AND il.Barcode IS NOT NULL
  AND LTRIM(RTRIM(il.Barcode)) <> ''
GROUP BY i.CompanyCode, i.VendorCode, il.Barcode, il.PONumber;
GO

PRINT 'OrcaAlokasyon – Liste view''ları oluşturuldu.';
GO
