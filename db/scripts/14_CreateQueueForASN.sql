-- ============================================================
-- ORCA ASN Portalı – CreateQueueForASN
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- Cursor: dbo.OrderAsnModel view'dan AsnJsonData alınır; JsonData SP içinde üretilmez.
-- SourceTypeId: 2=Return, 3=Normal ASN (karantina kaldırıldı)
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.CreateQueueForASN
    @InboundAsnId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @QueueId        INT
    DECLARE @IsReturn       BIT
    DECLARE @JsonData       NVARCHAR(MAX)
    DECLARE @SourceTypeId   INT
    DECLARE @TargetTypeId  INT
    DECLARE @Company        NVARCHAR(10)

    DECLARE OrderAsnCursor CURSOR FOR
        SELECT oam.AsnJsonData, oam.IsReturn, oam.CompanyCode
        FROM dbo.OrderAsnModel oam
        WHERE oam.AsnNo IS NULL
          AND oam.InboundAsnId = @InboundAsnId
          AND NOT EXISTS (SELECT NULL FROM dbo.[Queue] q
                         WHERE q.SourceTypeId IN (2, 3) AND q.SourceId = oam.InboundAsnId)

    OPEN OrderAsnCursor

    WHILE 1 = 1
    BEGIN
        FETCH OrderAsnCursor
        INTO @JsonData, @IsReturn, @Company

        IF @@FETCH_STATUS != 0
            BREAK

        IF @IsReturn = 1
            SET @SourceTypeId = 2
        ELSE
            SET @SourceTypeId = 3

        SET @TargetTypeId = 1

        BEGIN TRAN
        BEGIN TRY
            INSERT INTO dbo.[Queue] (SourceTypeId, SourceId, TargetTypeId, Company, JsonData, IsCompleted, TryCount, IsMaxTry)
            VALUES (@SourceTypeId, @InboundAsnId, @TargetTypeId, @Company, @JsonData, 0, 0, 0)

            SET @QueueId = SCOPE_IDENTITY()

            UPDATE dbo.[Queue] SET SuccessorScript = FORMATMESSAGE(N'EXEC dbo.MissionAccomplished %i', @QueueId)
            WHERE QueueId = @QueueId

            COMMIT
        END TRY
        BEGIN CATCH
            ROLLBACK
            DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE()
            RAISERROR(@ErrMsg, 16, 1)
        END CATCH
    END

    CLOSE OrderAsnCursor
    DEALLOCATE OrderAsnCursor
END
GO
