-- ============================================================
-- ORCA ASN Portalı – dbo.OrderAsnModel view
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaB2BPortal.sql (OrderAsnModel)
-- CreateQueueForASN bu view'dan AsnJsonData alır; JsonData SP içinde üretilmez.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF OBJECT_ID(N'dbo.OrderAsnModel', N'V') IS NOT NULL
    DROP VIEW dbo.OrderAsnModel;
GO

CREATE VIEW dbo.OrderAsnModel
AS
SELECT
    ia.InboundAsnId
   ,ia.InboundId
   ,ia.AsnNo
   ,ia.IsReturn
   ,ia.CompanyCode
   ,ia.WarehouseCode
   ,ia.VendorCode
   ,AsnJsonData = (
        SELECT ModelType       = ISNULL(pasn.ProcessCodeNo, -1)
              ,Description     = N''
              ,VendorCode      = ia.VendorCode
              ,IsCompleted     = CAST(1 AS BIT)
              ,IsConfirmed     = CAST(1 AS BIT)
              ,ImportFileNumber= NULLIF(ia.ImportFileNumber, N'')
              ,IsReturn        = ia.IsReturn
              ,LettersOfCreditNumber = N''
              ,OfficeCode      = N'M'
              ,OrderAsnDate    = CAST(GETDATE() AS DATE)
              ,WarehouseCode   = ia.WarehouseCode
              ,Lines          = (SELECT OrderLineId     = COALESCE(ref.OrderLineId, ol.OrderLineId)
                                      ,Qty1             = CAST(ISNULL(ial.Quantity, 0) AS INT)
                                      ,PickingNumber    = NULLIF(LTRIM(RTRIM(ISNULL(ial.CaseCode, il.PackageNumber))), N'')
                                 FROM dbo.InboundAsnLine ial
                                 INNER JOIN dbo.InboundLine il ON il.InboundLineId = ial.InboundLineId
                                 LEFT JOIN dbo.InboundAsnLineRef ref ON ref.InboundAsnLineId = ial.InboundAsnLineId
                                 LEFT JOIN ext.OrderLine ol ON ol.Company = ia.CompanyCode
                                      AND ISNULL(ol.PurchaseOrderNo,'') = ISNULL(il.PONumber,'')
                                      AND ol.ItemCode = ial.ProductCode
                                      AND ISNULL(ol.ColorCode,'') = ISNULL(ial.ColorCode,'')
                                      AND ISNULL(ol.ItemDim1Code,'') = ISNULL(ial.ItemDim1Code,'')
                                      AND ol.OpenQuantity > 0
                                 LEFT JOIN ext.OrderHeader oh ON oh.OrderHeaderId = ol.OrderHeaderId
                                      AND oh.Company = ol.Company
                                      AND oh.CurrAccCode = ia.VendorCode
                                      AND oh.WarehouseCode = ia.WarehouseCode
                                 WHERE ial.InboundAsnId = ia.InboundAsnId
                                   AND CAST(ISNULL(ial.Quantity, 0) AS INT) <> 0
                                   AND (ref.OrderLineId IS NOT NULL OR ol.OrderLineId IS NOT NULL)
                                 FOR JSON PATH)
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
FROM dbo.InboundAsn ia
LEFT JOIN dbo.ProcessCodes pasn ON pasn.ProcessCodeType = N'OrderASN' AND pasn.ProcessCode = ISNULL(ia.ProcessCode, N'')
GO

PRINT 'dbo.OrderAsnModel view created.';
GO
