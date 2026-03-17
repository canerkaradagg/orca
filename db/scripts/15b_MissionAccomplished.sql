-- ============================================================
-- ORCA ASN Portal - MissionAccomplished
-- Union mantığı: Kuyruk başarılı olduktan sonra SuccessorScript ile çağrılır.
-- SourceTypeId 4,5,6 için InsertOrders / InsertReservations / InsertDispOrders ile draft güncellenir.
-- IsLocked: Reserve (5) sonrası kilit, Order (4) + IsPool=1 sonrası aynı Request için kilidi aç + CancelReceivedOrder.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.MissionAccomplished
    @QueueId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SourceTypeId INT, @SourceId INT;

    SELECT @SourceTypeId = q.SourceTypeId, @SourceId = q.SourceId
    FROM dbo.[Queue] q
    WHERE q.QueueId = @QueueId;

    IF @SourceTypeId IS NULL RETURN;

    IF @SourceTypeId = 4
    BEGIN
        EXEC dbo.InsertOrders @QueueId = @QueueId;
        EXEC dbo.MissionAccomplished_AfterOrder @DraftOrderHeaderId = @SourceId;
    END
    ELSE IF @SourceTypeId = 5
    BEGIN
        EXEC dbo.InsertReservations @QueueId = @QueueId;
        EXEC dbo.MissionAccomplished_AfterReserve @QueueId = @QueueId, @DraftOrderHeaderId = @SourceId;
    END
    ELSE IF @SourceTypeId = 6
        EXEC dbo.InsertDispOrders @QueueId = @QueueId;
END
GO

PRINT 'dbo.MissionAccomplished oluşturuldu (Priority/CancelReceivedOrder/IsLocked mantığı ile).';
GO
