-- ============================================================
-- ORCA - MissionAccomplished yardimci SP'ler (IsLocked, CancelReceivedOrder)
-- 15b bu SP'leri cagirir; karmaşık mantik burada (parse/encoding sorunlarini onlemek icin).
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Order (4) bittikten sonra: IsPool=1 ise CancelReceivedOrder + ayni Request icin IsLocked=0
CREATE OR ALTER PROCEDURE dbo.MissionAccomplished_AfterOrder
    @DraftOrderHeaderId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RequestId INT, @IsPool BIT, @CurrAccTypeCode TINYINT, @CurrAccCode NVARCHAR(30), @SubCurrAccId UNIQUEIDENTIFIER;
    DECLARE @OrderLinesJson NVARCHAR(MAX);
    DECLARE @DohId INT, @DispId UNIQUEIDENTIFIER, @Comp NVARCHAR(10);

    SELECT @RequestId = doh.RequestId, @IsPool = doh.IsPool
    FROM dbo.DraftOrderHeader doh WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId;
    IF @RequestId IS NULL OR @IsPool <> 1 RETURN;

    SELECT @CurrAccTypeCode = doh.CurrAccTypeCode, @CurrAccCode = doh.CurrAccCode, @SubCurrAccId = doh.SubCurrAccId
    FROM dbo.DraftOrderHeader doh WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId;

    SELECT @OrderLinesJson = (
        SELECT ro.OrderLineId
        FROM dbo.ReferenceOrder ro
        WHERE ro.RequestId = @RequestId
          AND ro.CurrAccTypeCode = @CurrAccTypeCode
          AND (ro.CurrAccCode = @CurrAccCode OR (ro.CurrAccCode IS NULL AND @CurrAccCode IS NULL))
          AND (ro.SubCurrAccId = @SubCurrAccId OR (ro.SubCurrAccId IS NULL AND @SubCurrAccId IS NULL))
          AND ro.OrderLineId IS NOT NULL
        FOR JSON PATH
    );
    IF @OrderLinesJson IS NOT NULL
    BEGIN
        DECLARE @Co NVARCHAR(20);
        SELECT @Co = r.Company FROM dbo.DraftOrderHeader doh INNER JOIN dbo.Request r ON r.RequestId = doh.RequestId WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId;
        EXEC dbo.CancelReceivedOrder @SourceId = @DraftOrderHeaderId, @Company = @Co, @OrderLines = @OrderLinesJson;
    END

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT doh.DraftOrderHeaderId, doh.DispOrderHeaderId, r.Company
        FROM dbo.DraftOrderHeader doh
        INNER JOIN dbo.Request r ON r.RequestId = doh.RequestId
        WHERE doh.RequestId = @RequestId AND doh.DispOrderHeaderId IS NOT NULL;
    OPEN cur;
    FETCH NEXT FROM cur INTO @DohId, @DispId, @Comp;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC dbo.SetDispOrderLock @DispOrderHeaderId = @DispId, @Company = @Comp, @IsLocked = 0;
        FETCH NEXT FROM cur INTO @DohId, @DispId, @Comp;
    END
    CLOSE cur;
    DEALLOCATE cur;
END
GO

-- Reserve (5) bittikten sonra: cevaptan DispOrderHeaderId varsa IsLocked=1
CREATE OR ALTER PROCEDURE dbo.MissionAccomplished_AfterReserve
    @QueueId INT,
    @DraftOrderHeaderId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Response NVARCHAR(MAX), @DispOrderHeaderId UNIQUEIDENTIFIER;

    SELECT TOP 1 @Response = d.Response
    FROM dbo.QueueLogDetail d
    WHERE d.QueueId = @QueueId AND d.DetailType = N'Post' AND d.IsSuccess = 1 AND d.Response IS NOT NULL AND LEN(d.Response) > 10
    ORDER BY d.QueueLogDetailId DESC;
    IF @Response IS NULL RETURN;

    SET @DispOrderHeaderId = TRY_CAST(
        NULLIF(LTRIM(RTRIM(COALESCE(
            JSON_VALUE(@Response, '$.dispOrderHeaderId'),
            JSON_VALUE(@Response, '$.DispOrderHeaderId'),
            JSON_VALUE(@Response, '$.DispOrderHeaderID'),
            JSON_VALUE(@Response, '$.Result.DispOrderHeaderId'),
            JSON_VALUE(@Response, '$.Data.DispOrderHeaderId')
        ))), N'') AS UNIQUEIDENTIFIER);
    IF @DispOrderHeaderId IS NULL RETURN;

    DECLARE @Sql NVARCHAR(500), @Val1 NVARCHAR(20);
    SELECT @Val1 = r.Company FROM dbo.DraftOrderHeader doh INNER JOIN dbo.Request r ON r.RequestId = doh.RequestId WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId;
    SET @Sql = N'EXEC dbo.SetDispOrderLock @DispOrderHeaderId = ''' + CAST(@DispOrderHeaderId AS NVARCHAR(50)) + N''', @Company = N''' + ISNULL(REPLACE(@Val1, N'''', N''''''), N'') + N''', @IsLocked = 1';
    EXEC sp_executesql @Sql;
END
GO

PRINT 'dbo.MissionAccomplished_AfterOrder, MissionAccomplished_AfterReserve olusturuldu.';
GO
