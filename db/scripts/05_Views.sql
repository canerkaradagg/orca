-- ============================================================
-- ORCA ASN Portalı – View'lar
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ReceivedOrderSummary: InboundAsnLine verilerini CreateRequest SP için özetler
-- Referansta bu view B2BPortal'daki dbo.ReceivedOrder (view) > ReceivedOrderSummary zincirinden gelir.
-- ORCA tek DB olduğu için doğrudan InboundAsnLine'dan türetiyoruz.
CREATE OR ALTER VIEW dbo.ReceivedOrderSummary AS
SELECT ia.InboundAsnId
      ,ia.AsnNo
      ,ial.PurchaseOrderNo
      ,ial.ITAtt03
      ,ial.ProductCode
      ,ial.ColorCode
      ,LotCode         = CAST(NULL AS NVARCHAR(10))
      ,ial.ItemDim1Code
      ,ial.ItemDim2Code
      ,Quantity         = SUM(ial.Quantity)
      ,InboundQuantity  = SUM(ial.Quantity)
      ,LotQuantity      = CAST(NULL AS INT)
  FROM dbo.InboundAsn ia
  JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = ia.InboundAsnId
 WHERE ia.AsnNo IS NOT NULL
 GROUP BY ia.InboundAsnId
         ,ia.AsnNo
         ,ial.PurchaseOrderNo
         ,ial.ITAtt03
         ,ial.ProductCode
         ,ial.ColorCode
         ,ial.ItemDim1Code
         ,ial.ItemDim2Code;
GO

-- WarehouseCodes kaldırıldı; ext.OrderHeader ve 24_ChangeTrack doğrudan dbo.cdWarehouse kullanıyor.
IF OBJECT_ID(N'dbo.WarehouseCodes', N'V') IS NOT NULL
    DROP VIEW dbo.WarehouseCodes;
GO

CREATE OR ALTER VIEW dbo.AllocationExcludedWarehouse AS
SELECT Company = CAST(NULL AS NVARCHAR(10)), WarehouseCode = CAST(NULL AS NVARCHAR(10))
WHERE 1 = 0;
GO

CREATE OR ALTER VIEW dbo.AllocationExceptionVendor AS
SELECT Company = CAST(NULL AS NVARCHAR(10)), CurrAccCode = CAST(NULL AS NVARCHAR(30))
WHERE 1 = 0;
GO

PRINT 'OrcaAlokasyon – View''lar oluşturuldu.';
GO
