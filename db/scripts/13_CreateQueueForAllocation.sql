-- ============================================================
-- ORCA ASN Portalı – CreateQueueForAllocation
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- Tek cursor: dbo.DraftOrder view'dan OrderJsonData / ReserveJsonData / DispOrderJsonData (UNION).
-- JsonData view sütunlarından alınır; SP içinde üretilmez.
-- SourceTypeId: 4=Order, 5=Reserve, 6=DispOrder
--
-- ÖNEMLİ: Bu SP dbo.DraftOrder view'a bağımlıdır. "ItemDim3Code" / bağlama hatası alırsanız
-- ÖNCE 12a_View_DraftOrder.sql script'ini çalıştırın, sonra bu script'i çalıştırın.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.CreateQueueForAllocation
    @InboundAsnId INT = NULL  -- NULL = tümü; dolu = sadece bu ASN'e ait Request'lerin DraftOrder'ları
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @QueueId             INT
    DECLARE @DraftOrderHeaderId  INT
    DECLARE @SourceTypeId        INT
    DECLARE @JsonData            NVARCHAR(MAX)
    DECLARE @Company             NVARCHAR(10)
    DECLARE @TargetTypeId        INT

    DECLARE OrderHeaderCursor CURSOR FOR
        SELECT DraftOrderHeaderId, SourceTypeId = 4, JsonData = OrderJsonData, r.Company
        FROM dbo.DraftOrder do
        JOIN dbo.Request r ON r.RequestId = do.RequestId
        WHERE do.OrderQueueId IS NULL
          AND (@InboundAsnId IS NULL OR do.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId))
        UNION ALL
        SELECT DraftOrderHeaderId, SourceTypeId = 5, JsonData = ReserveJsonData, r.Company
        FROM dbo.DraftOrder do
        JOIN dbo.Request r ON r.RequestId = do.RequestId
        WHERE do.ReserveQueueId IS NULL
          AND do.IsOrdered = 1
          AND do.IsPool = 0
          AND (@InboundAsnId IS NULL OR do.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId))
        UNION ALL
        SELECT DraftOrderHeaderId, SourceTypeId = 6, JsonData = DispOrderJsonData, r.Company
        FROM dbo.DraftOrder do
        JOIN dbo.Request r ON r.RequestId = do.RequestId
        WHERE do.DispOrderQueueId IS NULL
          AND do.IsReserved = 1
          AND do.IsPool = 0
          AND (@InboundAsnId IS NULL OR do.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId))
        ORDER BY 2

    OPEN OrderHeaderCursor

    WHILE 1 = 1
    BEGIN
        FETCH OrderHeaderCursor
        INTO @DraftOrderHeaderId, @SourceTypeId, @JsonData, @Company

        IF @@FETCH_STATUS != 0
            BREAK

        SET @TargetTypeId = 1

        BEGIN TRAN
        BEGIN TRY
            INSERT INTO dbo.[Queue] (SourceTypeId, SourceId, TargetTypeId, Company, JsonData, IsCompleted, TryCount, IsMaxTry)
            VALUES (@SourceTypeId, @DraftOrderHeaderId, @TargetTypeId, @Company, @JsonData, 0, 0, 0)

            SET @QueueId = SCOPE_IDENTITY()

            UPDATE dbo.[Queue] SET SuccessorScript = FORMATMESSAGE(N'EXEC dbo.MissionAccomplished %i', @QueueId)
            WHERE QueueId = @QueueId

            UPDATE dbo.DraftOrderHeader SET OrderQueueId = @QueueId
            WHERE DraftOrderHeaderId = @DraftOrderHeaderId AND @SourceTypeId = 4

            UPDATE dbo.DraftOrderHeader SET ReserveQueueId = @QueueId
            WHERE DraftOrderHeaderId = @DraftOrderHeaderId AND @SourceTypeId = 5

            UPDATE dbo.DraftOrderHeader SET DispOrderQueueId = @QueueId
            WHERE DraftOrderHeaderId = @DraftOrderHeaderId AND @SourceTypeId = 6

            COMMIT
        END TRY
        BEGIN CATCH
            ROLLBACK
            DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE()
            RAISERROR(@ErrMsg, 16, 1)
        END CATCH
    END

    CLOSE OrderHeaderCursor
    DEALLOCATE OrderHeaderCursor
END
GO
