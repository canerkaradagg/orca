-- ============================================================
-- ORCA ASN Portalı – InsertOrders, InsertReservations, InsertDispOrders
-- Union mantığı: QueueLogDetail'deki son başarılı ERP cevabından Draft güncellenir.
-- MissionAccomplished bu SP'leri çağırır.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ==================== InsertOrders ====================
-- SourceTypeId=4: QueueLogDetail.Response'dan OrderHeaderId + Lines → DraftOrderHeader/DraftOrderLine
CREATE OR ALTER PROCEDURE dbo.InsertOrders
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SourceId INT, @Response NVARCHAR(MAX);

    SELECT @SourceId = q.SourceId
    FROM dbo.[Queue] q
    WHERE q.QueueId = @QueueId AND q.SourceTypeId = 4;
    IF @SourceId IS NULL RETURN;

    SELECT TOP 1 @Response = d.Response
    FROM dbo.QueueLogDetail d
    WHERE d.QueueId = @QueueId AND d.DetailType = N'Post' AND d.IsSuccess = 1 AND d.Response IS NOT NULL AND LEN(d.Response) > 10
    ORDER BY d.QueueLogDetailId DESC;
    IF @Response IS NULL RETURN;
    IF ISJSON(@Response) <> 1 RETURN;  /* Geçersiz veya kesilmiş JSON (örn. 4000 karakter sınırı) */

    -- Header
    UPDATE doh SET doh.OrderHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER), doh.IsOrdered = 1
    FROM dbo.DraftOrderHeader doh
    CROSS APPLY (
        SELECT COALESCE(
            JSON_VALUE(@Response, '$.HeaderID'),
            JSON_VALUE(@Response, '$.HeaderId'),
            JSON_VALUE(@Response, '$.OrderHeaderId'),
            JSON_VALUE(@Response, '$.Result.HeaderID'),
            JSON_VALUE(@Response, '$.Result.HeaderId'),
            JSON_VALUE(@Response, '$.Data.OrderHeaderId')
        ) AS HeaderId
    ) g
    WHERE doh.DraftOrderHeaderId = @SourceId AND g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

    -- Lines (satır sırasına göre eşleme)
    UPDATE dol SET dol.OrderLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
    FROM dbo.DraftOrderLine dol
    INNER JOIN (
        SELECT CAST(oj.[key] AS INT) AS lineIdx,
            COALESCE(JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId'), JSON_VALUE(oj.value, '$.OrderLineId')) AS LineId
        FROM OPENJSON(COALESCE(JSON_QUERY(@Response, '$.Result.Lines'), JSON_QUERY(@Response, '$.Data.Lines'), JSON_QUERY(@Response, '$.Lines'), '[]')) oj
    ) lj ON lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0
    INNER JOIN (
        SELECT DraftOrderLineId, ROW_NUMBER() OVER (ORDER BY DraftOrderLineId) - 1 AS lineIdx
        FROM dbo.DraftOrderLine WHERE DraftOrderHeaderId = @SourceId
    ) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.lineIdx = lj.lineIdx
    WHERE dol.DraftOrderHeaderId = @SourceId;
END
GO

-- ==================== InsertReservations ====================
-- SourceTypeId=5: ReserveHeaderId + ReserveLineId
CREATE OR ALTER PROCEDURE dbo.InsertReservations
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SourceId INT, @Response NVARCHAR(MAX);

    SELECT @SourceId = q.SourceId
    FROM dbo.[Queue] q
    WHERE q.QueueId = @QueueId AND q.SourceTypeId = 5;
    IF @SourceId IS NULL RETURN;

    SELECT TOP 1 @Response = d.Response
    FROM dbo.QueueLogDetail d
    WHERE d.QueueId = @QueueId AND d.DetailType = N'Post' AND d.IsSuccess = 1 AND d.Response IS NOT NULL AND LEN(d.Response) > 10
    ORDER BY d.QueueLogDetailId DESC;
    IF @Response IS NULL RETURN;
    IF ISJSON(@Response) <> 1 RETURN;  /* Geçersiz veya kesilmiş JSON (örn. 4000 karakter sınırı) */

    UPDATE doh SET doh.ReserveHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER), doh.IsReserved = 1
    FROM dbo.DraftOrderHeader doh
    CROSS APPLY (
        SELECT COALESCE(
            JSON_VALUE(@Response, '$.reserveHeaderId'),
            JSON_VALUE(@Response, '$.ReserveHeaderId'),
            JSON_VALUE(@Response, '$.ReserveHeaderID'),
            JSON_VALUE(@Response, '$.HeaderID'),
            JSON_VALUE(@Response, '$.Result.ReserveHeaderId'),
            JSON_VALUE(@Response, '$.Data.ReserveHeaderId')
        ) AS HeaderId
    ) g
    WHERE doh.DraftOrderHeaderId = @SourceId AND g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

    UPDATE dol SET dol.ReserveLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
    FROM dbo.DraftOrderLine dol
    INNER JOIN (
        SELECT CAST(oj.[key] AS INT) AS lineIdx,
            COALESCE(JSON_VALUE(oj.value, '$.ReserveLineID'), JSON_VALUE(oj.value, '$.ReserveLineId'), JSON_VALUE(oj.value, '$.reserveLineID'), JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId')) AS LineId
        FROM OPENJSON(COALESCE(JSON_QUERY(@Response, '$.Result.Lines'), JSON_QUERY(@Response, '$.Data.Lines'), JSON_QUERY(@Response, '$.Lines'), '[]')) oj
    ) lj ON lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0
    INNER JOIN (
        SELECT DraftOrderLineId, ROW_NUMBER() OVER (ORDER BY DraftOrderLineId) - 1 AS lineIdx
        FROM dbo.DraftOrderLine WHERE DraftOrderHeaderId = @SourceId
    ) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.lineIdx = lj.lineIdx
    WHERE dol.DraftOrderHeaderId = @SourceId;
END
GO

-- ==================== InsertDispOrders ====================
-- SourceTypeId=6: DraftOrderHeader/Line'a ERP GUID yazılır; ayrıca dbo.DispOrderHeader ve dbo.DispOrderLine'a kayıt açılır (AsnNo ile raporlama için).
CREATE OR ALTER PROCEDURE dbo.InsertDispOrders
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SourceId INT, @Response NVARCHAR(MAX);
    DECLARE @SourceGuid UNIQUEIDENTIFIER, @NewDohId INT;
    DECLARE @Ids TABLE (DispOrderHeaderId INT);

    SELECT @SourceId = q.SourceId
    FROM dbo.[Queue] q
    WHERE q.QueueId = @QueueId AND q.SourceTypeId = 6;
    IF @SourceId IS NULL RETURN;

    SELECT TOP 1 @Response = d.Response
    FROM dbo.QueueLogDetail d
    WHERE d.QueueId = @QueueId AND d.DetailType = N'Post' AND d.IsSuccess = 1 AND d.Response IS NOT NULL AND LEN(d.Response) > 10
    ORDER BY d.QueueLogDetailId DESC;
    IF @Response IS NULL RETURN;
    IF ISJSON(@Response) <> 1 RETURN;  /* Geçersiz veya kesilmiş JSON (örn. 4000 karakter sınırı) */

    UPDATE doh SET doh.DispOrderHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER), doh.IsDispOrdered = 1
    FROM dbo.DraftOrderHeader doh
    CROSS APPLY (
        SELECT COALESCE(
            JSON_VALUE(@Response, '$.dispOrderHeaderId'),
            JSON_VALUE(@Response, '$.DispOrderHeaderId'),
            JSON_VALUE(@Response, '$.DispOrderHeaderID'),
            JSON_VALUE(@Response, '$.HeaderID'),
            JSON_VALUE(@Response, '$.Result.DispOrderHeaderId'),
            JSON_VALUE(@Response, '$.Data.DispOrderHeaderId')
        ) AS HeaderId
    ) g
    WHERE doh.DraftOrderHeaderId = @SourceId AND g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

    UPDATE dol SET dol.DispOrderLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
    FROM dbo.DraftOrderLine dol
    INNER JOIN (
        SELECT CAST(oj.[key] AS INT) AS lineIdx,
            COALESCE(JSON_VALUE(oj.value, '$.DispOrderLineID'), JSON_VALUE(oj.value, '$.DispOrderLineId'), JSON_VALUE(oj.value, '$.dispOrderLineId'), JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId')) AS LineId
        FROM OPENJSON(COALESCE(JSON_QUERY(@Response, '$.Result.Lines'), JSON_QUERY(@Response, '$.Data.Lines'), JSON_QUERY(@Response, '$.Lines'), '[]')) oj
    ) lj ON lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0
    INNER JOIN (
        SELECT DraftOrderLineId, ROW_NUMBER() OVER (ORDER BY DraftOrderLineId) - 1 AS lineIdx
        FROM dbo.DraftOrderLine WHERE DraftOrderHeaderId = @SourceId
    ) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.lineIdx = lj.lineIdx
    WHERE dol.DraftOrderHeaderId = @SourceId;

    -- dbo.DispOrderHeader / DispOrderLine: AsnNo ile raporlama ve Finans Onay için kayıt aç (tekrar açmamak için SourceDispOrderHeaderId kontrolü)
    SELECT @SourceGuid = doh.DispOrderHeaderId FROM dbo.DraftOrderHeader doh WHERE doh.DraftOrderHeaderId = @SourceId;
    IF @SourceGuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.DispOrderHeader WHERE SourceDispOrderHeaderId = @SourceGuid)
    BEGIN
        INSERT INTO dbo.DispOrderHeader (Company, SourceDispOrderHeaderId, RequestId, AsnNo, CurrAccTypeCode, CurrAccCode, SubCurrAccId, WarehouseCode, DispOrderDate, ProcessCode, DispOrderStatusId, Valid)
        OUTPUT INSERTED.DispOrderHeaderId INTO @Ids(DispOrderHeaderId)
        SELECT r.Company, doh.DispOrderHeaderId, doh.RequestId, r.AsnNo, doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, r.WarehouseCode, CAST(GETDATE() AS DATE), doh.ProcessCode, 0, 1
        FROM dbo.DraftOrderHeader doh
        JOIN dbo.Request r ON r.RequestId = doh.RequestId
        WHERE doh.DraftOrderHeaderId = @SourceId;

        SELECT TOP 1 @NewDohId = DispOrderHeaderId FROM @Ids;
        IF @NewDohId IS NOT NULL
        BEGIN
            INSERT INTO dbo.DispOrderLine (DispOrderHeaderId, Company, SourceDispOrderLineId, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Qty1, Valid)
            SELECT @NewDohId, r.Company, dol.DispOrderLineId, r.ItemCode, r.ColorCode, dol.ItemDim1Code, dol.ItemDim2Code, ISNULL(dol.Quantity, 0), 1
            FROM dbo.DraftOrderLine dol
            JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
            JOIN dbo.Request r ON r.RequestId = doh.RequestId
            WHERE dol.DraftOrderHeaderId = @SourceId AND dol.DispOrderLineId IS NOT NULL;
        END
    END

    -- Category/Season/Brand: set-based güncelleme (Union UpdateCategoryFromV3 benzeri; cursor yok)
    IF @SourceGuid IS NOT NULL
    BEGIN
        DECLARE @DohId INT;
        SELECT @DohId = DispOrderHeaderId FROM dbo.DispOrderHeader WHERE SourceDispOrderHeaderId = @SourceGuid;
        IF @DohId IS NOT NULL
            EXEC dbo.UpdateDispOrderHeaderCategorySeason @DispOrderHeaderId = @DohId;
    END
END
GO

-- ==================== BackfillReserveLineIdsForDraftOrder ====================
-- Reserve sonrası Node handler beden bazlı güncellediği için aynı ReserveLineId birden fazla satıra
-- yazılmış olabilir. Bu SP, QueueLogDetail'deki başarılı Reserve response'unu kullanarak
-- InsertReservations mantığıyla ReserveLineId'leri satır sırasına göre yeniden atar (1:1).
-- Tek header: EXEC dbo.BackfillReserveLineIdsForDraftOrder @DraftOrderHeaderId = 418;
-- Tümü:     EXEC dbo.BackfillReserveLineIdsForDraftOrder;
CREATE OR ALTER PROCEDURE dbo.BackfillReserveLineIdsForDraftOrder
    @DraftOrderHeaderId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @DraftOrderHeaderId IS NOT NULL
    BEGIN
        DECLARE @QueueId INT;
        SELECT @QueueId = doh.ReserveQueueId
        FROM dbo.DraftOrderHeader doh
        WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId AND doh.ReserveQueueId IS NOT NULL;
        IF @QueueId IS NOT NULL
            EXEC dbo.InsertReservations @QueueId = @QueueId;
        RETURN;
    END

    DECLARE @qid INT;
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT doh.ReserveQueueId
        FROM dbo.DraftOrderHeader doh
        WHERE doh.ReserveQueueId IS NOT NULL AND doh.IsReserved = 1
          AND EXISTS (SELECT 1 FROM dbo.QueueLogDetail d WHERE d.QueueId = doh.ReserveQueueId AND d.DetailType = N'Post' AND d.IsSuccess = 1 AND d.Response IS NOT NULL AND LEN(d.Response) > 10);
    OPEN cur;
    WHILE 1 = 1
    BEGIN
        FETCH cur INTO @qid;
        IF @@FETCH_STATUS <> 0 BREAK;
        EXEC dbo.InsertReservations @QueueId = @qid;
    END
    CLOSE cur;
    DEALLOCATE cur;
END
GO

-- ==================== BackfillDispOrderFromDraft ====================
-- DispOrderHeaderId (ERP GUID) dolu ama dbo.DispOrderHeader'da karşılığı olmayan tüm DraftOrderHeader kayıtları için
-- dbo.DispOrderHeader ve dbo.DispOrderLine oluşturur. Böylece AsnNo ile SELECT * FROM DispOrderHeader sorgusu kayıt döner.
-- Örnek: EXEC dbo.BackfillDispOrderFromDraft;  veya EXEC dbo.BackfillDispOrderFromDraft @AsnNo = N'1-IP-11886';
CREATE OR ALTER PROCEDURE dbo.BackfillDispOrderFromDraft
    @AsnNo NVARCHAR(50) = NULL   -- NULL = tümü; dolu = sadece bu AsnNo'ya ait request'lerin draft'ları
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DraftOrderHeaderId INT, @SourceGuid UNIQUEIDENTIFIER, @NewDohId INT;
    DECLARE @Ids TABLE (DispOrderHeaderId INT);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT doh.DraftOrderHeaderId, doh.DispOrderHeaderId
        FROM dbo.DraftOrderHeader doh
        WHERE doh.DispOrderHeaderId IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.DispOrderHeader h WHERE h.SourceDispOrderHeaderId = doh.DispOrderHeaderId)
          AND (@AsnNo IS NULL OR EXISTS (SELECT 1 FROM dbo.Request r WHERE r.RequestId = doh.RequestId AND r.AsnNo = @AsnNo));

    OPEN cur;
    WHILE 1 = 1
    BEGIN
        FETCH cur INTO @DraftOrderHeaderId, @SourceGuid;
        IF @@FETCH_STATUS <> 0 BREAK;

        DELETE FROM @Ids;
        INSERT INTO dbo.DispOrderHeader (Company, SourceDispOrderHeaderId, RequestId, AsnNo, CurrAccTypeCode, CurrAccCode, SubCurrAccId, WarehouseCode, DispOrderDate, ProcessCode, DispOrderStatusId, Valid)
        OUTPUT INSERTED.DispOrderHeaderId INTO @Ids(DispOrderHeaderId)
        SELECT r.Company, doh.DispOrderHeaderId, doh.RequestId, r.AsnNo, doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, r.WarehouseCode, CAST(GETDATE() AS DATE), doh.ProcessCode, 0, 1
        FROM dbo.DraftOrderHeader doh
        JOIN dbo.Request r ON r.RequestId = doh.RequestId
        WHERE doh.DraftOrderHeaderId = @DraftOrderHeaderId;

        SELECT TOP 1 @NewDohId = DispOrderHeaderId FROM @Ids;
        IF @NewDohId IS NOT NULL
        BEGIN
            INSERT INTO dbo.DispOrderLine (DispOrderHeaderId, Company, SourceDispOrderLineId, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Qty1, Valid)
            SELECT @NewDohId, r.Company, dol.DispOrderLineId, r.ItemCode, r.ColorCode, dol.ItemDim1Code, dol.ItemDim2Code, ISNULL(dol.Quantity, 0), 1
            FROM dbo.DraftOrderLine dol
            JOIN dbo.DraftOrderHeader doh ON doh.DraftOrderHeaderId = dol.DraftOrderHeaderId
            JOIN dbo.Request r ON r.RequestId = doh.RequestId
            WHERE dol.DraftOrderHeaderId = @DraftOrderHeaderId AND dol.DispOrderLineId IS NOT NULL;
        END
    END
    CLOSE cur;
    DEALLOCATE cur;
END
GO

PRINT 'dbo.InsertOrders, InsertReservations, InsertDispOrders, BackfillReserveLineIdsForDraftOrder, BackfillDispOrderFromDraft oluşturuldu.';
GO
