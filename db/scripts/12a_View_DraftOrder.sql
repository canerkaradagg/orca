-- ============================================================
-- ORCA ASN Portalı – dbo.DraftOrder view
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql (DraftOrder view)
-- OrderJsonData, ReserveJsonData, DispOrderJsonData view'da üretilir; CreateQueueForAllocation bu sütunları kullanır.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF OBJECT_ID(N'dbo.DraftOrder', N'V') IS NOT NULL
    DROP VIEW dbo.DraftOrder;
GO

CREATE VIEW dbo.DraftOrder
AS
SELECT
    doh.DraftOrderHeaderId
   ,doh.RequestId
   ,doh.ProcessCode
   ,doh.CurrAccTypeCode
   ,doh.CurrAccCode
   ,doh.SubCurrAccCode
   ,doh.SubCurrAccId
   ,doh.OrderQueueId
   ,doh.ReserveQueueId
   ,doh.DispOrderQueueId
   ,doh.IsOrdered
   ,doh.IsReserved
   ,doh.IsDispOrdered
   ,doh.IsPool
   -- OrderJsonData: ModelType = dbo.ProcessCodes.ProcessCodeNo (ProcessCodeType='Order')
   ,OrderJsonData = (
        SELECT ModelType = ISNULL(po.ProcessCodeNo, -1)
              ,CustomerCode   = IIF(doh.CurrAccTypeCode = 3, doh.CurrAccCode, NULL)
              ,ToStoreCode    = IIF(doh.CurrAccTypeCode = 5, doh.CurrAccCode, NULL)
              ,SubCurrAccId   = doh.SubCurrAccId
              ,OrderDate      = CAST(GETDATE() AS DATE)
              ,OfficeCode     = doh.OfficeCode
              ,Description    = doh.Description
              ,DocCurrencyCode= IIF(doh.CurrAccTypeCode = 3, doh.DocCurrencyCode, NULL)
              ,WarehouseCode  = r.WarehouseCode
              ,ToWarehouseCode     = CASE WHEN doh.ProcessCode IN ('S') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,CustomerWarehouseCode= CASE WHEN doh.ProcessCode IN ('DS','ES') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,PaymentTerm    = IIF(doh.CurrAccTypeCode = 3, doh.PaymentTerm, NULL)
              ,IncotermCode1  = IIF(doh.CurrAccTypeCode = 3, NULLIF(doh.IncotermCode1,''), NULL)
              ,Attributes     = (SELECT * FROM (SELECT AttributeCode = doh.ATAtt01, AttributeTypeCode = 1 WHERE doh.ATAtt01 IS NOT NULL
                                UNION ALL
                                SELECT AttributeCode = doh.ATAtt02, AttributeTypeCode = 2 WHERE doh.ATAtt02 IS NOT NULL) att FOR JSON PATH)
              ,DeliveryCompanyCode = N''
              ,ShipmentMethodCode  = doh.ShipmentMethodCode
              ,IsCompleted    = CAST(1 AS BIT)
              ,ExportFileNumber = CASE WHEN doh.ProcessCode = 'ES' THEN N'' END
              ,SumLines        = (SELECT ItemTypeCode = 1, ItemCode = r.ItemCode, ColorCode = r.ColorCode, LotCode = dol.LotCode, Qty1 = dol.LotQuantity, ITAtt01 = r.PurchaseOrderNo, DeliveryDate = CAST(GETDATE() AS DATE)
                                  FROM dbo.DraftOrderLot dol
                                  WHERE dol.DraftOrderHeaderId = doh.DraftOrderHeaderId
                                  FOR JSON PATH)
              ,Lines          = (SELECT ItemTypeCode = 1, ItemCode = r.ItemCode, ColorCode = r.ColorCode
                                      ,ItemDim1Code = NULLIF(dol.ItemDim1Code,''), ItemDim2Code = NULLIF(dol.ItemDim2Code,'')
                                      ,Qty1 = dol.Quantity, ITAtt01 = dol.ITAtt01, ITAtt02 = dol.ITAtt02, ITAtt03 = dol.ITAtt03, ITAtt04 = dol.ITAtt04
                                      ,DeliveryDate = CAST(GETDATE() AS DATE), Price = CAST(NULL AS MONEY)
                                 FROM dbo.DraftOrderLine dol
                                 WHERE dol.DraftOrderHeaderId = doh.DraftOrderHeaderId
                                   AND (dol.DraftOrderLotId = 0 OR dol.DraftOrderLotId IS NULL)
                                 FOR JSON PATH)
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
   -- ReserveJsonData: ModelType = dbo.ProcessCodes.ProcessCodeNo (ProcessCodeType='Reservation')
   ,ReserveJsonData = (
        SELECT ModelType = ISNULL(pr.ProcessCodeNo, -1)
              ,CompanyCode    = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN 1 END
              ,CustomerCode   = CASE WHEN doh.ProcessCode IN ('WS','DS','ES') THEN doh.CurrAccCode END
              ,SubCurrAccId   = doh.SubCurrAccId
              ,Description    = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN N'' END
              ,IsCompleted    = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN CAST(1 AS BIT) END
              ,IsOrderBase    = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN CAST(1 AS BIT) END
              ,IsReturn       = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN CAST(0 AS BIT) END
              ,OfficeCode     = doh.OfficeCode
              ,ReserveDate    = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN CAST(GETDATE() AS DATE) END
              ,StoreCode      = CASE WHEN doh.ProcessCode = 'S' THEN N'' END
              ,ToStoreCode    = CASE WHEN doh.ProcessCode = 'S' THEN doh.CurrAccCode END
              ,WarehouseCode  = r.WarehouseCode
              ,ToWarehouseCode     = CASE WHEN doh.ProcessCode IN ('S','ES','DS','WS') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,CustomerWarehouseCode = CASE WHEN doh.ProcessCode IN ('DS','ES') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,InternalDescription  = N'B2B Allocation, DOH: ' + CAST(doh.DraftOrderHeaderId AS NVARCHAR(20))
              ,Lines          = (SELECT OrderLineID = dol.OrderLineId, Qty1 = dol.Quantity, LineDescription = r.AsnNo
                                FROM dbo.DraftOrderLine dol
                                WHERE dol.DraftOrderHeaderId = doh.DraftOrderHeaderId
                                FOR JSON PATH)
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
   -- DispOrderJsonData: ModelType = dbo.ProcessCodes.ProcessCodeNo (ProcessCodeType='DispOrder')
   ,DispOrderJsonData = (
        SELECT ModelType = ISNULL(pd.ProcessCodeNo, -1)
              ,CompanyCode    = 1
              ,CustomerCode   = CASE WHEN doh.ProcessCode IN ('WS','DS','ES') THEN doh.CurrAccCode END
              ,SubCurrAccId   = doh.SubCurrAccId
              ,Description    = N''
              ,DispOrderDate  = CAST(GETDATE() AS DATE)
              ,IsCompleted    = CAST(1 AS BIT)
              ,IsReturn       = CASE WHEN doh.ProcessCode IN ('S','DS','ES') THEN CAST(0 AS BIT) END
              ,OfficeCode     = doh.OfficeCode
              ,WarehouseCode  = r.WarehouseCode
              ,ToWarehouseCode     = CASE WHEN doh.ProcessCode IN ('S','ES','DS','WS') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,CustomerWarehouseCode = CASE WHEN doh.ProcessCode IN ('DS','ES') THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,RoundsmanCode  = N''
              ,StoreCode      = CASE WHEN doh.ProcessCode = 'S' THEN N'' END
              ,ToStoreCode    = CASE WHEN doh.ProcessCode = 'S' THEN (SELECT TOP 1 oh.ToWarehouseCode FROM ext.OrderHeader oh WHERE EXISTS (SELECT 1 FROM dbo.ReferenceOrder ro WHERE ro.RequestId = doh.RequestId AND ro.CurrAccTypeCode = doh.CurrAccTypeCode AND ro.CurrAccCode = doh.CurrAccCode AND ISNULL(ro.SubCurrAccCode,'') = ISNULL(doh.SubCurrAccCode,'') AND oh.OrderHeaderId = ro.OrderHeaderId)) END
              ,InternalDescription  = N'B2B Allocation, DOH: ' + CAST(doh.DraftOrderHeaderId AS NVARCHAR(20))
              ,Lines          = (SELECT ReserveLineID = dol.ReserveLineId, Qty1 = dol.Quantity, LineDescription = r.AsnNo
                                FROM dbo.DraftOrderLine dol
                                WHERE dol.DraftOrderHeaderId = doh.DraftOrderHeaderId
                                FOR JSON PATH)
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
FROM dbo.DraftOrderHeader doh
INNER JOIN dbo.Request r ON r.RequestId = doh.RequestId
LEFT JOIN dbo.ProcessCodes po ON po.ProcessCodeType = N'Order'        AND po.ProcessCode = LTRIM(RTRIM(ISNULL(doh.ProcessCode,N'')))
LEFT JOIN dbo.ProcessCodes pr ON pr.ProcessCodeType = N'Reservation'  AND pr.ProcessCode = LTRIM(RTRIM(ISNULL(doh.ProcessCode,N'')))
LEFT JOIN dbo.ProcessCodes pd ON pd.ProcessCodeType = N'DispOrder'   AND pd.ProcessCode = LTRIM(RTRIM(ISNULL(doh.ProcessCode,N'')))
GO

PRINT 'dbo.DraftOrder view created.';
GO
