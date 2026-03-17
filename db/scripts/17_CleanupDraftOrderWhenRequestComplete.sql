-- ============================================================
-- ORCA ASN Portalı – Request tabanlı draft temizlik
-- Bir ASN için Request tablosundaki tüm satırlar StatusId=2 ve CompletedDate dolu ise
-- o ASN'e ait DraftOrderHeader/Line/Lot kayıtları silinir.
-- Windows Service veya bakım job periyodik çağırır.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Tek Request tamamlanmışsa (StatusId=2, CompletedDate dolu) o Request'e ait Draft silinir.
-- Örnek: EXEC dbo.CleanupDraftOrderForRequest @RequestId = 72;
CREATE OR ALTER PROCEDURE dbo.CleanupDraftOrderForRequest
    @RequestId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @RequestId IS NULL RETURN;

    IF NOT EXISTS (SELECT 1 FROM dbo.Request WHERE RequestId = @RequestId AND StatusId = 2 AND CompletedDate IS NOT NULL)
        RETURN;

    BEGIN TRY
        BEGIN TRAN;

        DELETE dol
        FROM dbo.DraftOrderLine dol
        INNER JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
        WHERE doh.RequestId = @RequestId;

        DELETE dol
        FROM dbo.DraftOrderLot dol
        INNER JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
        WHERE doh.RequestId = @RequestId;

        DELETE FROM dbo.DraftOrderHeader WHERE RequestId = @RequestId;

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END
GO

CREATE OR ALTER PROCEDURE dbo.CleanupDraftOrderWhenRequestComplete
    @InboundAsnId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @InboundAsnId IS NULL
        RETURN;

    DECLARE @Total INT, @Completed INT;
    SELECT @Total = COUNT(*) FROM dbo.Request WHERE InboundAsnId = @InboundAsnId;
    IF @Total = 0
        RETURN;

    SELECT @Completed = COUNT(*)
    FROM dbo.Request
    WHERE InboundAsnId = @InboundAsnId
      AND StatusId = 2
      AND CompletedDate IS NOT NULL;

    IF @Completed <> @Total
        RETURN;

    BEGIN TRY
        BEGIN TRAN;

        DELETE dol
        FROM dbo.DraftOrderLine dol
        INNER JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
        WHERE doh.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId);

        DELETE dol
        FROM dbo.DraftOrderLot dol
        INNER JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
        WHERE doh.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId);

        DELETE FROM dbo.DraftOrderHeader
        WHERE RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId);

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END
GO

-- Tüm tamamlanmış ASN'ler için temizlik (Windows Service periyodik çağırır)
CREATE OR ALTER PROCEDURE dbo.CleanupDraftOrderAllCompletedAsns
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @InboundAsnId INT;
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT r.InboundAsnId
        FROM dbo.Request r
        GROUP BY r.InboundAsnId
        HAVING COUNT(*) = SUM(CASE WHEN r.StatusId = 2 AND r.CompletedDate IS NOT NULL THEN 1 ELSE 0 END);

    OPEN cur;
    WHILE 1 = 1
    BEGIN
        FETCH cur INTO @InboundAsnId;
        IF @@FETCH_STATUS <> 0 BREAK;
        EXEC dbo.CleanupDraftOrderWhenRequestComplete @InboundAsnId = @InboundAsnId;
    END;
    CLOSE cur;
    DEALLOCATE cur;
END
GO

PRINT 'dbo.CleanupDraftOrderForRequest, CleanupDraftOrderWhenRequestComplete, CleanupDraftOrderAllCompletedAsns oluşturuldu.';
GO
