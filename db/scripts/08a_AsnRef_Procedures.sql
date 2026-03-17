-- ============================================================
-- ORCA ASN Portalı – ASN referans SP'leri (Union B2BPortal uyumlu)
-- FillInboundAsnCase, AllocateInboundAsnLineRef, AllocateInboundAsnLineSource
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ==================== FillInboundAsnCase ====================
-- InboundAsnLine'dan tekil CaseCode (ve isteğe bağlı LotCode) listesini InboundAsnCase'e yazar.
CREATE OR ALTER PROCEDURE dbo.FillInboundAsnCase
    @InboundAsnId INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @InboundAsnId IS NULL RETURN;

    DELETE FROM dbo.InboundAsnCase WHERE InboundAsnId = @InboundAsnId;

    INSERT INTO dbo.InboundAsnCase (InboundAsnId, CaseCode, LotCode)
    SELECT @InboundAsnId, ial.CaseCode, NULL
      FROM dbo.InboundAsnLine ial
     WHERE ial.InboundAsnId = @InboundAsnId
       AND (ial.CaseCode IS NOT NULL AND LTRIM(RTRIM(ial.CaseCode)) <> N'')
     GROUP BY ial.CaseCode;
END
GO

-- ==================== AllocateInboundAsnLineRef ====================
-- InboundAsnLine satırlarını ext.OrderLine ile eşleştirip InboundAsnLineRef'e yazar (ASN satırı ↔ sipariş satırı).
CREATE OR ALTER PROCEDURE dbo.AllocateInboundAsnLineRef
    @InboundAsnId INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @InboundAsnId IS NULL RETURN;

    DELETE FROM dbo.InboundAsnLineRef
     WHERE InboundAsnLineId IN (SELECT InboundAsnLineId FROM dbo.InboundAsnLine WHERE InboundAsnId = @InboundAsnId);

    ;WITH ia AS (
        SELECT InboundAsnId, CompanyCode, VendorCode, WarehouseCode
          FROM dbo.InboundAsn WHERE InboundAsnId = @InboundAsnId
    ),
    matched AS (
        SELECT ial.InboundAsnLineId,
               oh.ProcessCode,
               ol.OrderLineId,
               Qty = CASE WHEN ISNULL(ol.OpenQuantity, 0) <= 0 THEN 0
                          ELSE (SELECT MIN(q) FROM (VALUES (ISNULL(ial.Quantity, 0)), (ol.OpenQuantity)) AS v(q))
                     END
          FROM dbo.InboundAsnLine ial
          INNER JOIN ia ON ia.InboundAsnId = ial.InboundAsnId
          INNER JOIN ext.OrderHeader oh ON oh.Company = ia.CompanyCode
                                       AND oh.CurrAccCode = ia.VendorCode
                                       AND oh.WarehouseCode = ia.WarehouseCode
          INNER JOIN ext.OrderLine ol ON ol.Company = oh.Company
                                     AND ol.OrderHeaderId = oh.OrderHeaderId
                                     AND ISNULL(ol.PurchaseOrderNo, N'') = ISNULL(ial.PurchaseOrderNo, N'')
                                     AND ol.ItemCode = ial.ProductCode
                                     AND ISNULL(ol.ColorCode, N'') = ISNULL(ial.ColorCode, N'')
                                     AND ISNULL(ol.ItemDim1Code, N'') = ISNULL(ial.ItemDim1Code, N'')
                                     AND ISNULL(ol.ItemDim2Code, N'') = ISNULL(ial.ItemDim2Code, N'')
                                     AND ISNULL(ol.OpenQuantity, 0) > 0
         WHERE ial.InboundAsnId = @InboundAsnId
           AND ISNULL(ial.Quantity, 0) > 0
    ),
    ranked AS (
        SELECT InboundAsnLineId, ProcessCode, OrderLineId, Qty,
               rn = ROW_NUMBER() OVER (PARTITION BY InboundAsnLineId ORDER BY (SELECT NULL))
          FROM matched
    )
    INSERT INTO dbo.InboundAsnLineRef (InboundAsnLineId, ProcessCode, OrderLineId, Quantity, IsNew)
    SELECT InboundAsnLineId, ProcessCode, OrderLineId, Qty, 1
      FROM ranked
     WHERE rn = 1 AND Qty > 0;
END
GO

-- ==================== AllocateInboundAsnLineSource ====================
-- ASN'e bağlı referans siparişleri (ext.OrderHeader/OrderLine) tespit edip InboundAsnLineSourceHeader ve InboundAsnLineSource doldurur.
CREATE OR ALTER PROCEDURE dbo.AllocateInboundAsnLineSource
    @InboundAsnId INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @InboundAsnId IS NULL RETURN;

    DELETE FROM dbo.InboundAsnLineSource       WHERE InboundAsnId = @InboundAsnId;
    DELETE FROM dbo.InboundAsnLineSourceHeader WHERE InboundAsnId = @InboundAsnId;

    DECLARE @CompanyCode   NVARCHAR(10), @VendorCode NVARCHAR(30), @WarehouseCode NVARCHAR(10);
    SELECT @CompanyCode = CompanyCode, @VendorCode = VendorCode, @WarehouseCode = WarehouseCode
      FROM dbo.InboundAsn WHERE InboundAsnId = @InboundAsnId;

    IF @CompanyCode IS NULL RETURN;

    ;WITH AsnLines AS (
        SELECT ial.InboundAsnId, ial.PurchaseOrderNo, ial.ProductCode, ial.ColorCode, ial.ItemDim1Code, ial.ItemDim2Code, ial.Quantity
          FROM dbo.InboundAsnLine ial
         WHERE ial.InboundAsnId = @InboundAsnId AND ISNULL(ial.Quantity, 0) > 0
    ),
    OrderHeaders AS (
        SELECT DISTINCT oh.OrderHeaderId, oh.OrderNumber, oh.ProcessCode, oh.OrderDate, oh.CurrAccCode, oh.WarehouseCode, oh.DocCurrencyCode
          FROM ext.OrderHeader oh
          INNER JOIN ext.OrderLine ol ON ol.Company = oh.Company AND ol.OrderHeaderId = oh.OrderHeaderId
          INNER JOIN AsnLines al ON oh.Company = @CompanyCode
                               AND oh.CurrAccCode = @VendorCode
                               AND oh.WarehouseCode = @WarehouseCode
                               AND ISNULL(ol.PurchaseOrderNo, N'') = ISNULL(al.PurchaseOrderNo, N'')
                               AND ol.ItemCode = al.ProductCode
                               AND ISNULL(ol.ColorCode, N'') = ISNULL(al.ColorCode, N'')
                               AND ISNULL(ol.ItemDim1Code, N'') = ISNULL(al.ItemDim1Code, N'')
                               AND ISNULL(ol.ItemDim2Code, N'') = ISNULL(al.ItemDim2Code, N'')
                               AND ISNULL(ol.OpenQuantity, 0) > 0
    )
    INSERT INTO dbo.InboundAsnLineSourceHeader (InboundAsnId, ProcessCode, VendorCode, OrderDate, OrderNumber, OrderHeaderId, IsCompleted, DocCurrencyCode, WarehouseCode)
    SELECT @InboundAsnId, ProcessCode, CurrAccCode, OrderDate, OrderNumber, OrderHeaderId, 0, DocCurrencyCode, WarehouseCode
      FROM OrderHeaders;

    ;WITH AsnLines AS (
        SELECT ial.InboundAsnId, ial.PurchaseOrderNo, ial.ProductCode, ial.ColorCode, ial.ItemDim1Code, ial.ItemDim2Code, ial.Quantity
          FROM dbo.InboundAsnLine ial
         WHERE ial.InboundAsnId = @InboundAsnId AND ISNULL(ial.Quantity, 0) > 0
    ),
    SourceRows AS (
        SELECT ialsh.InboundAsnLineSourceHeaderId, ialsh.InboundAsnId,
               ol.OrderLineId,
               OpenQty = ISNULL(ol.OpenQuantity, 0),
               ReqQty  = al.Quantity,
               ol.ItemCode, ol.ColorCode, ol.ItemDim1Code, ol.ItemDim2Code,
               DocCurrencyCode = oh.DocCurrencyCode
          FROM dbo.InboundAsnLineSourceHeader ialsh
          INNER JOIN ext.OrderHeader oh ON oh.Company = @CompanyCode
                                       AND oh.OrderHeaderId = ialsh.OrderHeaderId
          INNER JOIN ext.OrderLine ol ON ol.Company = oh.Company AND ol.OrderHeaderId = oh.OrderHeaderId
          INNER JOIN AsnLines al ON ISNULL(ol.PurchaseOrderNo, N'') = ISNULL(al.PurchaseOrderNo, N'')
                               AND ol.ItemCode = al.ProductCode
                               AND ISNULL(ol.ColorCode, N'') = ISNULL(al.ColorCode, N'')
                               AND ISNULL(ol.ItemDim1Code, N'') = ISNULL(al.ItemDim1Code, N'')
                               AND ISNULL(ol.ItemDim2Code, N'') = ISNULL(al.ItemDim2Code, N'')
                               AND ISNULL(ol.OpenQuantity, 0) > 0
         WHERE ialsh.InboundAsnId = @InboundAsnId
    )
    INSERT INTO dbo.InboundAsnLineSource (InboundAsnLineSourceHeaderId, InboundAsnId, OrderLineId, OpenQuantity, RequiredQuantity, ClosedQuantity, DocCurrencyCode, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code)
    SELECT InboundAsnLineSourceHeaderId, InboundAsnId, OrderLineId, OpenQty, ReqQty, 0, DocCurrencyCode, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code
      FROM SourceRows;
END
GO

PRINT 'dbo.FillInboundAsnCase, dbo.AllocateInboundAsnLineRef, dbo.AllocateInboundAsnLineSource oluşturuldu.';
GO
