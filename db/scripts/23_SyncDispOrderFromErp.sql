-- ============================================================
-- ORCA – DispOrderHeader / DispOrderLine ERP senkronizasyonu
-- Union UpdateReplenishment mantığı: ext view'lardan dbo tablolarını günceller.
-- Change Tracking yerine periyodik UPDATE kullanılır (linked server uyumlu).
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== SyncDispOrderFromErp ====================
-- Mevcut dbo.DispOrderHeader ve dbo.DispOrderLine kayıtlarını ext view'lardan günceller.
-- InsertDispOrders/BackfillDispOrderFromDraft ile açılan kayıtlar minimal; bu SP tüm alanları ERP ile eşitler.
-- Örnek: EXEC dbo.SyncDispOrderFromErp;  veya EXEC dbo.SyncDispOrderFromErp @Company = N'OLKA';
CREATE OR ALTER PROCEDURE dbo.SyncDispOrderFromErp
    @Company NVARCHAR(10) = NULL   -- NULL = tüm şirketler; dolu = sadece bu şirket
AS
BEGIN
    SET NOCOUNT ON;

    IF OBJECT_ID('ext.DispOrderHeader', 'V') IS NULL
    BEGIN
        RAISERROR(N'ext.DispOrderHeader view yok. 21_Views_Finance.sql çalıştırın.', 16, 1);
        RETURN;
    END
    IF OBJECT_ID('ext.DispOrderLine', 'V') IS NULL
    BEGIN
        RAISERROR(N'ext.DispOrderLine view yok. 21_Views_Finance.sql çalıştırın.', 16, 1);
        RETURN;
    END

    -- Header: tüm ext alanları + AsnNo/RequestId (DraftOrderHeader->Request'ten)
    UPDATE doh SET
        doh.DispOrderNumber  = ext.DispOrderNumber,
        doh.DispOrderDate    = ext.DispOrderDate,
        doh.ProcessCode     = ext.ProcessCode,
        doh.CurrAccTypeCode = ext.CurrAccTypeCode,
        doh.CurrAccCode     = ext.CurrAccCode,
        doh.SubCurrAccId    = ext.SubCurrAccId,
        doh.WarehouseCode   = ext.WarehouseCode,
        doh.Valid          = 1,
        doh.RequestId      = CASE WHEN r.RequestId IS NOT NULL THEN r.RequestId ELSE doh.RequestId END,
        doh.AsnNo          = CASE WHEN r.AsnNo IS NOT NULL THEN r.AsnNo ELSE doh.AsnNo END
    FROM dbo.DispOrderHeader doh WITH (NOLOCK)
    JOIN ext.DispOrderHeader ext ON ext.Company = doh.Company AND ext.DispOrderHeaderId = doh.SourceDispOrderHeaderId
    LEFT JOIN dbo.DraftOrderHeader dh ON dh.DispOrderHeaderId = ext.DispOrderHeaderId
    LEFT JOIN dbo.Request r ON r.RequestId = dh.RequestId
    WHERE doh.SourceDispOrderHeaderId IS NOT NULL
      AND (@Company IS NULL OR doh.Company = @Company);

    -- Line: tüm ext alanları (Qty1, ITAtt02, OrderLineId, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code)
    UPDATE dol SET
        dol.Qty1          = ISNULL(ext.Qty1, dol.Qty1),
        dol.ITAtt02       = ext.ITAtt02,
        dol.OrderLineId   = ext.OrderLineId,
        dol.ItemCode      = ext.ItemCode,
        dol.ColorCode     = ext.ColorCode,
        dol.ItemDim1Code  = ext.ItemDim1Code,
        dol.ItemDim2Code  = ext.ItemDim2Code
    FROM dbo.DispOrderLine dol WITH (NOLOCK)
    JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.DispOrderHeaderId = dol.DispOrderHeaderId
    JOIN ext.DispOrderLine ext ON ext.Company = dol.Company
                             AND ext.DispOrderHeaderId = doh.SourceDispOrderHeaderId
                             AND ext.DispOrderLineId = dol.SourceDispOrderLineId
    WHERE dol.SourceDispOrderLineId IS NOT NULL
      AND (@Company IS NULL OR dol.Company = @Company);

    EXEC dbo.UpdateDispOrderLinePrice @Company = @Company;
    PRINT 'SyncDispOrderFromErp tamamlandı.';
END
GO

-- ==================== UpdateDispOrderLinePrice ====================
-- Union UpdateDispOrderLinePrice: ext.OrderLinePrice'tan BaseListPrice, ListPrice, VatRate, Markup çeker.
-- Finans Onay ekranında TotalAmount doğru hesaplansın diye fiyatları günceller.
CREATE OR ALTER PROCEDURE dbo.UpdateDispOrderLinePrice
    @Company NVARCHAR(10) = NULL   -- NULL = tüm şirketler; dolu = sadece bu şirket
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dol SET
        dol.BaseListPrice  = olp.BaseListPrice,
        dol.ListPrice      = olp.ListPrice,
        dol.ListPriceDate  = GETDATE(),
        dol.VatRate        = olp.VatRate,
        dol.Markup         = olp.Markup
    FROM dbo.DispOrderLine dol WITH (NOLOCK)
    JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.DispOrderHeaderId = dol.DispOrderHeaderId
    JOIN ext.OrderLinePrice olp ON olp.Company = dol.Company
                              AND olp.DispOrderLineId = dol.SourceDispOrderLineId
    WHERE dol.SourceDispOrderLineId IS NOT NULL
      AND doh.DispOrderStatusId < 2
      AND olp.BaseListPrice > 0
      AND (@Company IS NULL OR dol.Company = @Company);

    PRINT 'UpdateDispOrderLinePrice tamamlandı.';
END
GO

PRINT 'SyncDispOrderFromErp, UpdateDispOrderLinePrice oluşturuldu.';
GO
