-- ============================================================
-- ORCA ASN Portalı – SetDispOrderLock, CancelReceivedOrder
-- Union mantığı: Reserve (5) sonrası IsLocked=1, Order (4) + IsPool=1 sonrası IsLocked=0 ve alınan sipariş iptali.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ==================== SetDispOrderLock ====================
-- ERP trDispOrderHeader.IsLocked güncellemesi. Linked server yoksa DispOrderLockCommand tablosuna yazılır.
CREATE OR ALTER PROCEDURE dbo.SetDispOrderLock
    @DispOrderHeaderId UNIQUEIDENTIFIER,
    @Company           NVARCHAR(10),
    @IsLocked          BIT
AS
BEGIN
    SET NOCOUNT ON;
    IF @DispOrderHeaderId IS NULL RETURN;

    INSERT INTO dbo.DispOrderLockCommand (DispOrderHeaderId, Company, IsLocked)
    VALUES (@DispOrderHeaderId, ISNULL(@Company, N''), @IsLocked);

    -- Linked server ile doğrudan ERP güncellemesi yapılacaksa örnek:
    -- EXEC ('UPDATE [LinkedServer].[CompanyDB].dbo.trDispOrderHeader SET IsLocked = @IsLock WHERE DispOrderHeaderId = @DispId') ...
END
GO

-- ==================== CancelReceivedOrder ====================
-- Havuz siparişinde Order bittikten sonra ERP'de "alınan sipariş" satırlarının iptali (Union b2b.CancelReceivedOrder).
-- Gerçek implementasyon: B2B Portal SP çağrısı (linked server) veya ERP API.
CREATE OR ALTER PROCEDURE dbo.CancelReceivedOrder
    @SourceId   INT,
    @Company    NVARCHAR(20),
    @OrderLines NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    IF @SourceId IS NULL RETURN;

    -- Stub: İptal komutu loglanır; gerçek iptal B2B/ERP tarafında linked server veya API ile yapılacak.
    -- Örnek: EXEC [OlkaB2BPortal].b2b.CancelReceivedOrder @SourceId, @Company, @OrderLines
    -- Log/komut tablosu yoksa sessizce çıkılır; ihtiyaç halinde CancelReceivedOrderLog tablosu eklenebilir.
END
GO

PRINT 'dbo.SetDispOrderLock, dbo.CancelReceivedOrder oluşturuldu.';
GO
