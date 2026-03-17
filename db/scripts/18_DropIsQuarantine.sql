-- ============================================================
-- ORCA – IsQuarantine sütununu kaldır
-- InboundAsn'e bağımlı tüm view/SP'ler kaldırılır, sütun silinir, view'lar yeniden oluşturulur.
-- ============================================================

USE [OrcaAlokasyon]
GO

-- 1) InboundAsn'e bağımlı view'ları kaldır
IF OBJECT_ID(N'dbo.vw_AsnStatus', N'V') IS NOT NULL DROP VIEW dbo.vw_AsnStatus;
IF OBJECT_ID(N'dbo.vw_InboundList', N'V') IS NOT NULL DROP VIEW dbo.vw_InboundList;
IF OBJECT_ID(N'dbo.ReceivedOrderSummary', N'V') IS NOT NULL DROP VIEW dbo.ReceivedOrderSummary;
IF OBJECT_ID(N'dbo.OrderAsnModel', N'V') IS NOT NULL DROP VIEW dbo.OrderAsnModel;
GO

-- 2) InboundAsn kullanan SP'leri kaldır
IF OBJECT_ID(N'dbo.CreateQueueForASN', N'P') IS NOT NULL DROP PROCEDURE dbo.CreateQueueForASN;
IF OBJECT_ID(N'dbo.CreateRequest', N'P') IS NOT NULL DROP PROCEDURE dbo.CreateRequest;
IF OBJECT_ID(N'dbo.Allocation', N'P') IS NOT NULL DROP PROCEDURE dbo.Allocation;
GO

-- 3) IsQuarantine sütunundaki default constraint varsa kaldır, sonra sütunu kaldır
DECLARE @cn NVARCHAR(256);
SELECT @cn = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.InboundAsn') AND c.name = 'IsQuarantine';
IF @cn IS NOT NULL
    EXEC('ALTER TABLE dbo.InboundAsn DROP CONSTRAINT ' + @cn);
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'IsQuarantine')
    ALTER TABLE dbo.InboundAsn DROP COLUMN IsQuarantine;
GO

-- 3) ReceivedOrderSummary yeniden oluştur (05_Views ile uyumlu, IsQuarantine yok)
CREATE VIEW dbo.ReceivedOrderSummary AS
SELECT ia.InboundAsnId, ia.AsnNo, ial.PurchaseOrderNo, ial.ITAtt03, ial.ProductCode, ial.ColorCode
      ,LotCode = CAST(NULL AS NVARCHAR(10)), ial.ItemDim1Code, ial.ItemDim2Code
      ,Quantity = SUM(ial.Quantity), InboundQuantity = SUM(ial.Quantity), LotQuantity = CAST(NULL AS INT)
  FROM dbo.InboundAsn ia
  JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = ia.InboundAsnId
 WHERE ia.AsnNo IS NOT NULL
 GROUP BY ia.InboundAsnId, ia.AsnNo, ial.PurchaseOrderNo, ial.ITAtt03, ial.ProductCode, ial.ColorCode
        , ial.ItemDim1Code, ial.ItemDim2Code;
GO

-- 4) OrderAsnModel yeniden oluştur (12b ile uyumlu, IsQuarantine yok)
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW dbo.OrderAsnModel AS
SELECT ia.InboundAsnId, ia.InboundId, ia.AsnNo, ia.IsReturn, ia.CompanyCode, ia.WarehouseCode, ia.VendorCode
   ,AsnJsonData = (
        SELECT ModelType = ISNULL(pasn.ProcessCodeNo, -1), Description = N'', VendorCode = ia.VendorCode
              ,IsCompleted = CAST(1 AS BIT), IsConfirmed = CAST(1 AS BIT), ImportFileNumber = NULLIF(ia.ImportFileNumber, N'')
              ,IsReturn = ia.IsReturn, LettersOfCreditNumber = N'', OfficeCode = N'M', OrderAsnDate = CAST(GETDATE() AS DATE), WarehouseCode = ia.WarehouseCode
              ,Lines = (SELECT OrderLineId = ol.OrderLineId, Qty1 = CAST(ISNULL(ial.Quantity, 0) AS INT), PickingNumber = NULLIF(LTRIM(RTRIM(ISNULL(ial.CaseCode, il.PackageNumber))), N'')
                         FROM dbo.InboundAsnLine ial
                         INNER JOIN dbo.InboundLine il ON il.InboundLineId = ial.InboundLineId
                         INNER JOIN ext.OrderLine ol ON ol.Company = ia.CompanyCode AND ISNULL(ol.PurchaseOrderNo,'') = ISNULL(il.PONumber,'') AND ol.ItemCode = ial.ProductCode AND ISNULL(ol.ColorCode,'') = ISNULL(ial.ColorCode,'') AND ISNULL(ol.ItemDim1Code,'') = ISNULL(ial.ItemDim1Code,'') AND ol.OpenQuantity > 0
                         INNER JOIN ext.OrderHeader oh ON oh.OrderHeaderId = ol.OrderHeaderId AND oh.Company = ol.Company AND oh.CurrAccCode = ia.VendorCode AND oh.WarehouseCode = ia.WarehouseCode
                         WHERE ial.InboundAsnId = ia.InboundAsnId AND CAST(ISNULL(ial.Quantity, 0) AS INT) <> 0
                         FOR JSON PATH)
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
FROM dbo.InboundAsn ia
LEFT JOIN dbo.ProcessCodes pasn ON pasn.ProcessCodeType = N'OrderASN' AND pasn.ProcessCode = ISNULL(ia.ProcessCode, N'');
GO

-- 5) vw_InboundList ve vw_AsnStatus yeniden oluştur (12_Views_List ile uyumlu)
CREATE VIEW dbo.vw_InboundList AS
SELECT i.InboundId, i.CompanyCode, i.WarehouseCode, COALESCE(NULLIF(LTRIM(RTRIM(w.WarehouseDescription)),''), i.WarehouseCode) AS WarehouseDescription
    , i.VendorCode, COALESCE(NULLIF(LTRIM(RTRIM(v.CurrAccDescription)),''), i.VendorCode) AS VendorDescription
    , i.Status, i.ImportFileNumber, i.InProgress, COALESCE(a.AsnNo, '') AS AsnNo, i.FileName, i.CreatedTime, COALESCE(i.CreatedUserId,'') AS CreatedUserId
FROM dbo.Inbound i
LEFT JOIN dbo.InboundAsn a ON a.InboundId = i.InboundId
LEFT JOIN dbo.cdWarehouse w ON LTRIM(RTRIM(CAST(w.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode)) AND w.WarehouseCode = i.WarehouseCode
LEFT JOIN dbo.Vendor v ON LTRIM(RTRIM(CAST(v.Company AS NVARCHAR(100)))) = LTRIM(RTRIM(i.CompanyCode)) AND LTRIM(RTRIM(v.CurrAccCode)) = LTRIM(RTRIM(i.VendorCode));
GO

CREATE VIEW dbo.vw_AsnStatus AS
SELECT i.InboundId, i.Status, COALESCE(a.AsnNo,'') AS AsnNo, a.IsAllocation, x.RequestCount, x.CompletedRequestCount, x.AllocatedDate
FROM dbo.Inbound i
LEFT JOIN dbo.InboundAsn a ON a.InboundId = i.InboundId
OUTER APPLY (
    SELECT RequestCount = COUNT(*), CompletedRequestCount = SUM(IIF(r.CompletedDate IS NOT NULL OR r.AllocatedDate IS NOT NULL, 1, 0)), AllocatedDate = MAX(r.AllocatedDate)
    FROM dbo.Request r WHERE r.InboundAsnId = a.InboundAsnId
) x;
GO

-- 6) DROP edilen SP'lerin migration kaydını sil ki run-scripts tekrar oluştursun
DELETE FROM dbo._MigrationHistory WHERE ScriptName IN ('08_CreateRequest.sql', '10_Allocation.sql', '14_CreateQueueForASN.sql', '15_QueueProcess.sql', '12a_View_DraftOrder.sql');
GO

PRINT 'IsQuarantine kaldırıldı; view''lar yeniden oluşturuldu.';
GO
