-- ============================================================
-- ORCA ASN Portalı – Kuyruktan Draft bayraklarını ve ERP ID'lerini geri doldur
-- QueueLogDetail.Response (ERP cevabı) içinden ReserveHeaderId, ReserveLineID,
-- DispOrderHeaderId, DispOrderLineId, OrderHeaderId, OrderLineId okunup
-- DraftOrderHeader / DraftOrderLine güncellenir.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET NOCOUNT ON;

-- Yardımcı: En güncel başarılı Response'u getir (root veya Result/Data sarmalı)
DECLARE @Resp TABLE (
    QueueId INT NOT NULL,
    SourceTypeId INT NOT NULL,
    DraftOrderHeaderId INT NOT NULL,
    Response NVARCHAR(MAX) NOT NULL,
    PRIMARY KEY (QueueId)
);

INSERT INTO @Resp (QueueId, SourceTypeId, DraftOrderHeaderId, Response)
SELECT q.QueueId, q.SourceTypeId, q.SourceId,
    COALESCE(d.Response, N'{}')
FROM dbo.[Queue] q
INNER JOIN (
    SELECT QueueId, Response,
        ROW_NUMBER() OVER (PARTITION BY QueueId ORDER BY QueueLogDetailId DESC) AS rn
    FROM dbo.QueueLogDetail
    WHERE IsSuccess = 1 AND DetailType = N'Post' AND Response IS NOT NULL AND LEN(Response) > 10
) d ON d.QueueId = q.QueueId AND d.rn = 1
WHERE q.SourceTypeId IN (4, 5, 6) AND q.IsCompleted = 1;

-- ----- Order (4): OrderHeaderId + OrderLineId -----
UPDATE doh SET doh.OrderHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderHeader doh
INNER JOIN @Resp r ON r.DraftOrderHeaderId = doh.DraftOrderHeaderId AND r.SourceTypeId = 4
CROSS APPLY (
    SELECT COALESCE(
        JSON_VALUE(r.Response, '$.HeaderID'),
        JSON_VALUE(r.Response, '$.HeaderId'),
        JSON_VALUE(r.Response, '$.OrderHeaderId'),
        JSON_VALUE(r.Response, '$.Result.HeaderID'),
        JSON_VALUE(r.Response, '$.Result.HeaderId'),
        JSON_VALUE(r.Response, '$.Data.OrderHeaderId')
    ) AS HeaderId
) g
WHERE g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

UPDATE dol SET dol.OrderLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderLine dol
INNER JOIN (
    SELECT r.DraftOrderHeaderId, CAST(oj.[key] AS INT) AS lineIdx,
        COALESCE(JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId'), JSON_VALUE(oj.value, '$.OrderLineId')) AS LineId
    FROM @Resp r
    CROSS APPLY OPENJSON(COALESCE(JSON_QUERY(r.Response, '$.Result.Lines'), JSON_QUERY(r.Response, '$.Data.Lines'), JSON_QUERY(r.Response, '$.Lines'), '[]')) oj
    WHERE r.SourceTypeId = 4
) lj ON lj.DraftOrderHeaderId = dol.DraftOrderHeaderId
INNER JOIN (
    SELECT DraftOrderLineId, DraftOrderHeaderId, ROW_NUMBER() OVER (PARTITION BY DraftOrderHeaderId ORDER BY DraftOrderLineId) - 1 AS lineIdx
    FROM dbo.DraftOrderLine
) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.DraftOrderHeaderId = lj.DraftOrderHeaderId AND dl.lineIdx = lj.lineIdx
WHERE lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0;

-- ----- Reserve (5): ReserveHeaderId + ReserveLineId -----
UPDATE doh SET doh.ReserveHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderHeader doh
INNER JOIN @Resp r ON r.DraftOrderHeaderId = doh.DraftOrderHeaderId AND r.SourceTypeId = 5
CROSS APPLY (
    SELECT COALESCE(
        JSON_VALUE(r.Response, '$.reserveHeaderId'),
        JSON_VALUE(r.Response, '$.ReserveHeaderId'),
        JSON_VALUE(r.Response, '$.ReserveHeaderID'),
        JSON_VALUE(r.Response, '$.HeaderID'),
        JSON_VALUE(r.Response, '$.Result.reserveHeaderId'),
        JSON_VALUE(r.Response, '$.Result.ReserveHeaderId'),
        JSON_VALUE(r.Response, '$.Data.ReserveHeaderId')
    ) AS HeaderId
) g
WHERE g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

UPDATE dol SET dol.ReserveLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderLine dol
INNER JOIN (
    SELECT r.DraftOrderHeaderId, CAST(oj.[key] AS INT) AS lineIdx,
        COALESCE(JSON_VALUE(oj.value, '$.ReserveLineID'), JSON_VALUE(oj.value, '$.ReserveLineId'), JSON_VALUE(oj.value, '$.reserveLineID'), JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId')) AS LineId
    FROM @Resp r
    CROSS APPLY OPENJSON(COALESCE(JSON_QUERY(r.Response, '$.Result.Lines'), JSON_QUERY(r.Response, '$.Data.Lines'), JSON_QUERY(r.Response, '$.Lines'), '[]')) oj
    WHERE r.SourceTypeId = 5
) lj ON lj.DraftOrderHeaderId = dol.DraftOrderHeaderId
INNER JOIN (
    SELECT DraftOrderLineId, DraftOrderHeaderId, ROW_NUMBER() OVER (PARTITION BY DraftOrderHeaderId ORDER BY DraftOrderLineId) - 1 AS lineIdx
    FROM dbo.DraftOrderLine
) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.DraftOrderHeaderId = lj.DraftOrderHeaderId AND dl.lineIdx = lj.lineIdx
WHERE lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0;

-- ----- DispOrder (6): DispOrderHeaderId + DispOrderLineId -----
UPDATE doh SET doh.DispOrderHeaderId = CAST(NULLIF(LTRIM(RTRIM(g.HeaderId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderHeader doh
INNER JOIN @Resp r ON r.DraftOrderHeaderId = doh.DraftOrderHeaderId AND r.SourceTypeId = 6
CROSS APPLY (
    SELECT COALESCE(
        JSON_VALUE(r.Response, '$.dispOrderHeaderId'),
        JSON_VALUE(r.Response, '$.DispOrderHeaderId'),
        JSON_VALUE(r.Response, '$.DispOrderHeaderID'),
        JSON_VALUE(r.Response, '$.HeaderID'),
        JSON_VALUE(r.Response, '$.Result.DispOrderHeaderId'),
        JSON_VALUE(r.Response, '$.Data.DispOrderHeaderId')
    ) AS HeaderId
) g
WHERE g.HeaderId IS NOT NULL AND LEN(LTRIM(RTRIM(g.HeaderId))) > 0;

UPDATE dol SET dol.DispOrderLineId = CAST(NULLIF(LTRIM(RTRIM(lj.LineId)), N'') AS UNIQUEIDENTIFIER)
FROM dbo.DraftOrderLine dol
INNER JOIN (
    SELECT r.DraftOrderHeaderId, CAST(oj.[key] AS INT) AS lineIdx,
        COALESCE(JSON_VALUE(oj.value, '$.DispOrderLineID'), JSON_VALUE(oj.value, '$.DispOrderLineId'), JSON_VALUE(oj.value, '$.dispOrderLineId'), JSON_VALUE(oj.value, '$.LineID'), JSON_VALUE(oj.value, '$.LineId')) AS LineId
    FROM @Resp r
    CROSS APPLY OPENJSON(COALESCE(JSON_QUERY(r.Response, '$.Result.Lines'), JSON_QUERY(r.Response, '$.Data.Lines'), JSON_QUERY(r.Response, '$.Lines'), '[]')) oj
    WHERE r.SourceTypeId = 6
) lj ON lj.DraftOrderHeaderId = dol.DraftOrderHeaderId
INNER JOIN (
    SELECT DraftOrderLineId, DraftOrderHeaderId, ROW_NUMBER() OVER (PARTITION BY DraftOrderHeaderId ORDER BY DraftOrderLineId) - 1 AS lineIdx
    FROM dbo.DraftOrderLine
) dl ON dl.DraftOrderLineId = dol.DraftOrderLineId AND dl.DraftOrderHeaderId = lj.DraftOrderHeaderId AND dl.lineIdx = lj.lineIdx
WHERE lj.LineId IS NOT NULL AND LEN(LTRIM(RTRIM(lj.LineId))) > 0;

-- Bayrakları güncelle (IsOrdered, IsReserved, IsDispOrdered)
UPDATE doh SET doh.IsOrdered = 1
FROM dbo.DraftOrderHeader doh
INNER JOIN dbo.[Queue] q ON q.QueueId = doh.OrderQueueId AND q.SourceTypeId = 4 AND q.IsCompleted = 1
WHERE doh.IsOrdered = 0;

UPDATE doh SET doh.IsReserved = 1
FROM dbo.DraftOrderHeader doh
INNER JOIN dbo.[Queue] q ON q.QueueId = doh.ReserveQueueId AND q.SourceTypeId = 5 AND q.IsCompleted = 1
WHERE doh.IsReserved = 0;

UPDATE doh SET doh.IsDispOrdered = 1
FROM dbo.DraftOrderHeader doh
INNER JOIN dbo.[Queue] q ON q.QueueId = doh.DispOrderQueueId AND q.SourceTypeId = 6 AND q.IsCompleted = 1
WHERE doh.IsDispOrdered = 0;

-- IsReserved=1 olan ama DispOrderQueueId henüz atanmamış kayıtlar için 6 kuyruğa eklenir
EXEC dbo.CreateQueueForAllocation;

PRINT 'Backfill tamamlandı: Order/Reserve/DispOrder header-line ID''leri ve bayraklar güncellendi; CreateQueueForAllocation çalıştırıldı.';
GO
