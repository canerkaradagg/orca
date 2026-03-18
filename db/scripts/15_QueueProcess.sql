-- ============================================================
-- ORCA ASN Portalı – Kuyruk işleme SP'leri
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql (GetQueueList, InsertQueueLogDetail, LogMaintenance)
-- IsCompleted=0 ve IsMaxTry=0 olan kayıtlar listelenir; ERP'ye post sonrası başarıda IsCompleted=1, hata da TryCount artar; TryCount=10 olunca IsMaxTry=1.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ==================== GetQueueList ====================
-- İşlenecek kuyruk satırlarını döner: IsCompleted=0, IsMaxTry=0, JsonData dolu.
-- Sıra: SourceTypeId, sonra Priority tablosunda olan ASN'ler önce, sonra TryCount, QueueId (Union Priority mantığı).
CREATE OR ALTER PROCEDURE dbo.GetQueueList
    @BatchSize INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    IF @BatchSize IS NULL OR @BatchSize < 1 SET @BatchSize = 100;

    ;WITH QueueWithAsnNo AS (
        SELECT
            q.QueueId,
            q.SourceTypeId,
            q.SourceId,
            q.TargetTypeId,
            q.Company,
            q.PrecessorScript,
            q.JsonData,
            q.SuccessorScript,
            q.TryCount,
            AsnNo = CASE
                WHEN q.SourceTypeId IN (1, 2, 3) THEN (SELECT ia.AsnNo FROM dbo.InboundAsn ia WHERE ia.InboundAsnId = q.SourceId)
                WHEN q.SourceTypeId IN (4, 5, 6) THEN (SELECT r.AsnNo FROM dbo.DraftOrderHeader doh INNER JOIN dbo.Request r ON r.RequestId = doh.RequestId WHERE doh.DraftOrderHeaderId = q.SourceId)
                ELSE NULL
            END
        FROM dbo.[Queue] q
        WHERE q.IsCompleted = 0
          AND q.IsMaxTry = 0
          AND q.JsonData IS NOT NULL
    )
    SELECT TOP (@BatchSize)
        ql.QueueId,
        ql.SourceTypeId,
        ql.SourceId,
        ql.TargetTypeId,
        ql.Company,
        ql.PrecessorScript,
        ql.JsonData,
        ql.SuccessorScript,
        ql.TryCount
    FROM QueueWithAsnNo ql
    LEFT JOIN dbo.Priority p ON p.AsnNo = ql.AsnNo
    ORDER BY ql.SourceTypeId,
             CASE WHEN p.PriorityId IS NOT NULL THEN 0 ELSE 1 END,
             ql.TryCount,
             ql.QueueId;
END
GO

-- ==================== InsertQueueLog ====================
-- Bir işlem başlangıcı için QueueLog satırı ekler; QueueLogId döner.
CREATE OR ALTER PROCEDURE dbo.InsertQueueLog
    @QueueId INT,
    @QueueLogId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.QueueLog (QueueId, StartDate, EndDate, IsSuccess)
    VALUES (@QueueId, GETDATE(), NULL, NULL);

    SET @QueueLogId = SCOPE_IDENTITY();
END
GO

-- ==================== UpdateQueueLog ====================
-- İşlem bittiğinde QueueLog'u günceller (EndDate, IsSuccess).
CREATE OR ALTER PROCEDURE dbo.UpdateQueueLog
    @QueueLogId INT,
    @IsSuccess BIT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.QueueLog
    SET EndDate = GETDATE(),
        IsSuccess = @IsSuccess
    WHERE QueueLogId = @QueueLogId;
END
GO

-- ==================== InsertQueueLogDetail ====================
-- QueueLogDetail'e bir kayıt ekler (ERP yanıtı / hata mesajı).
CREATE OR ALTER PROCEDURE dbo.InsertQueueLogDetail
    @QueueLogId INT,
    @QueueId INT,
    @DetailType NVARCHAR(50),
    @StartDate DATETIME = NULL,
    @EndDate DATETIME = NULL,
    @Response NVARCHAR(MAX) = NULL,
    @ExceptionMessage NVARCHAR(MAX) = NULL,
    @IsSuccess BIT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @StartDate IS NULL SET @StartDate = GETDATE();
    IF @EndDate IS NULL SET @EndDate = GETDATE();

    INSERT INTO dbo.QueueLogDetail (QueueLogId, QueueId, DetailType, StartDate, EndDate, Response, ExceptionMessage, IsSuccess)
    VALUES (@QueueLogId, @QueueId, @DetailType, @StartDate, @EndDate, @Response, @ExceptionMessage, @IsSuccess);
END
GO

-- ==================== UpdateQueueOnSuccess ====================
-- ERP'den başarı alındığında: IsCompleted=1, LastTryDate güncelle.
CREATE OR ALTER PROCEDURE dbo.UpdateQueueOnSuccess
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.[Queue]
    SET IsCompleted = 1,
        LastTryDate = GETDATE()
    WHERE QueueId = @QueueId;
END
GO

-- ==================== UpdateQueueOnFailure ====================
-- Hata alındığında: TryCount += 1, LastTryDate; TryCount >= MaxTryCount ise IsMaxTry = 1 (MaxTryCount = dbo.SystemParameter).
CREATE OR ALTER PROCEDURE dbo.UpdateQueueOnFailure
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxTryCount INT = 10;
    SELECT @MaxTryCount = ISNULL(TRY_CAST(ParameterValue AS INT), 10)
    FROM dbo.SystemParameter WHERE ParameterKey = N'MaxTryCount';

    IF @MaxTryCount IS NULL OR @MaxTryCount < 1 SET @MaxTryCount = 10;

    UPDATE dbo.[Queue]
    SET TryCount = TryCount + 1,
        LastTryDate = GETDATE(),
        IsMaxTry = CASE WHEN TryCount + 1 >= @MaxTryCount THEN 1 ELSE 0 END
    WHERE QueueId = @QueueId;
END
GO

-- ==================== LogMaintenance ====================
-- TryCount >= MaxTryCount olan ama hâlâ IsMaxTry=0 kalan kayıtları IsMaxTry=1 yapar.
CREATE OR ALTER PROCEDURE dbo.LogMaintenance
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxTryCount INT = 10;
    SELECT @MaxTryCount = ISNULL(TRY_CAST(ParameterValue AS INT), 10)
    FROM dbo.SystemParameter WHERE ParameterKey = N'MaxTryCount';

    IF @MaxTryCount IS NULL OR @MaxTryCount < 1 SET @MaxTryCount = 10;

    UPDATE q
    SET q.IsMaxTry = 1
    FROM dbo.[Queue] q
    WHERE q.IsCompleted = 0
      AND q.TryCount >= @MaxTryCount
      AND q.IsMaxTry = 0;
END
GO

-- ==================== QueueLogCleanup ====================
-- LogRetentionDays parametresinden eski QueueLogDetail ve QueueLog kayıtlarını siler.
CREATE OR ALTER PROCEDURE dbo.QueueLogCleanup
    @RetentionDays INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @RetentionDays IS NULL
    BEGIN
        SELECT @RetentionDays = ISNULL(TRY_CAST(ParameterValue AS INT), 30)
        FROM dbo.SystemParameter WHERE ParameterKey = N'LogRetentionDays';
    END
    IF @RetentionDays IS NULL OR @RetentionDays < 1 SET @RetentionDays = 30;

    DECLARE @BeforeDate DATETIME = DATEADD(DAY, -@RetentionDays, GETDATE());

    DELETE FROM dbo.QueueLogDetail
    WHERE QueueLogId IN (SELECT QueueLogId FROM dbo.QueueLog WHERE EndDate < @BeforeDate);

    DELETE FROM dbo.QueueLog WHERE EndDate < @BeforeDate;
END
GO

-- ==================== SetRequestCompletedIfAllDraftsComplete ====================
-- Union mantığı: Request'e ait tüm DraftOrderHeader satırları IsCompleted=1 olduğunda
-- Request.CompletedDate atanır (Reserve + DispOrder bittikten sonra).
-- Aynı ASN'deki tüm Request satırlarına CompletedDate atıldıysa Inbound.Status = N'Alokasyon Yapıldı' yapılır.
CREATE OR ALTER PROCEDURE dbo.SetRequestCompletedIfAllDraftsComplete
    @DraftOrderHeaderId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @DraftOrderHeaderId IS NULL RETURN;

    DECLARE @RequestId INT, @InboundAsnId INT, @InboundId INT;

    SELECT @RequestId = RequestId FROM dbo.DraftOrderHeader WHERE DraftOrderHeaderId = @DraftOrderHeaderId;
    IF @RequestId IS NULL RETURN;

    UPDATE r
    SET r.CompletedDate = GETDATE()
    FROM dbo.Request r
    WHERE r.RequestId = @RequestId
      AND r.CompletedDate IS NULL
      AND (SELECT COUNT(*) FROM dbo.DraftOrderHeader doh WHERE doh.RequestId = r.RequestId)
        = (SELECT COUNT(*) FROM dbo.DraftOrderHeader doh
           WHERE doh.RequestId = r.RequestId
             AND (CASE WHEN doh.IsPool = 1 THEN CAST(doh.IsOrdered AS INT) ELSE CAST(doh.IsDispOrdered AS INT) END) = 1);

    IF @@ROWCOUNT = 0 RETURN;

    SELECT @InboundAsnId = r.InboundAsnId FROM dbo.Request r WHERE r.RequestId = @RequestId;
    IF @InboundAsnId IS NULL RETURN;

    -- Referansı bu request olan Exception=1 request'leri alokasyona sok (referans tamamlandığı için artık Allocation devam edebilir)
    DECLARE @ExRequestId INT;
    DECLARE ex_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT r2.RequestId
        FROM dbo.Request r2
        WHERE r2.Exception = 1
          AND r2.ReferenceId = @RequestId
          AND r2.AllocatedDate IS NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.DraftOrderHeader doh WHERE doh.RequestId = r2.RequestId);
    OPEN ex_cursor;
    WHILE 1 = 1
    BEGIN
        FETCH ex_cursor INTO @ExRequestId;
        IF @@FETCH_STATUS <> 0 BREAK;
        BEGIN TRY
            EXEC dbo.Allocation @RequestId = @ExRequestId;
        END TRY
        BEGIN CATCH
            DECLARE @AllocErr NVARCHAR(4000) = ERROR_MESSAGE();
            EXEC dbo.SaveErrorLog @ErrorMessage = @AllocErr, @ErrorSource = N'SetRequestCompletedIfAllDraftsComplete(Allocation)', @RaiseError = 0;
        END CATCH
    END
    CLOSE ex_cursor;
    DEALLOCATE ex_cursor;

    -- Exception=1 için yeni oluşan DraftOrder'ları kuyruğa ekle
    BEGIN TRY
        EXEC dbo.CreateQueueForAllocation @InboundAsnId = @InboundAsnId;
    END TRY
    BEGIN CATCH
        DECLARE @QueueErr NVARCHAR(4000) = ERROR_MESSAGE();
        EXEC dbo.SaveErrorLog @ErrorMessage = @QueueErr, @ErrorSource = N'SetRequestCompletedIfAllDraftsComplete(CreateQueueForAllocation)', @RaiseError = 0;
    END CATCH

    IF (SELECT COUNT(*) FROM dbo.Request WHERE InboundAsnId = @InboundAsnId)
       = (SELECT COUNT(*) FROM dbo.Request WHERE InboundAsnId = @InboundAsnId AND CompletedDate IS NOT NULL)
    BEGIN
        SELECT @InboundId = ia.InboundId FROM dbo.InboundAsn ia WHERE ia.InboundAsnId = @InboundAsnId;
        IF @InboundId IS NOT NULL
            UPDATE dbo.Inbound SET Status = N'Alokasyon Yapıldı' WHERE InboundId = @InboundId;
    END
END
GO

PRINT 'dbo.GetQueueList, InsertQueueLog, UpdateQueueLog, InsertQueueLogDetail, UpdateQueueOnSuccess, UpdateQueueOnFailure, LogMaintenance, QueueLogCleanup, SetRequestCompletedIfAllDraftsComplete oluşturuldu.';
GO
