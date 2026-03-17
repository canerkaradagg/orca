-- ============================================================
-- ORCA ASN Portalı – Kuyruk tabloları
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- SourceTypeId: 2=Return, 3=ASN, 4=Order, 5=Reserve, 6=DispOrder (1=Quarantine kaldırıldı)
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== QUEUE ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Queue' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.[Queue] (
    QueueId          INT            IDENTITY(1,1) NOT NULL,
    SourceTypeId     INT            NULL,
    SourceId         INT            NULL,
    TargetTypeId     INT            NULL,
    Company          NVARCHAR(10)   NULL,
    PrecessorScript  NVARCHAR(MAX)  NULL,
    JsonData         NVARCHAR(MAX)  NULL,
    SuccessorScript  NVARCHAR(MAX)  NULL,
    IsCompleted      BIT            NOT NULL DEFAULT 0,
    TryCount         INT            NOT NULL DEFAULT 0,
    CreatedDate      DATETIME       NOT NULL DEFAULT GETDATE(),
    IsMaxTry         BIT            NOT NULL DEFAULT 0,
    LastTryDate      DATETIME       NULL,
    CONSTRAINT PK_Queue PRIMARY KEY CLUSTERED (QueueId ASC)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Queue_IsCompleted_IsMaxTry_TryCount' AND object_id = OBJECT_ID('dbo.Queue'))
    CREATE NONCLUSTERED INDEX IX_Queue_IsCompleted_IsMaxTry_TryCount ON dbo.[Queue] (IsCompleted, IsMaxTry, TryCount);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Queue_SourceTypeId_SourceId' AND object_id = OBJECT_ID('dbo.Queue'))
    CREATE NONCLUSTERED INDEX IX_Queue_SourceTypeId_SourceId ON dbo.[Queue] (SourceTypeId, SourceId);
GO

-- ==================== QUEUE LOG ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'QueueLog' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.QueueLog (
    QueueLogId   INT       IDENTITY(1,1) NOT NULL,
    QueueId      INT       NULL,
    StartDate    DATETIME  NULL,
    EndDate      DATETIME  NULL,
    IsSuccess    BIT       NULL,
    CONSTRAINT PK_QueueLog PRIMARY KEY CLUSTERED (QueueLogId ASC)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QueueLog_QueueId' AND object_id = OBJECT_ID('dbo.QueueLog'))
    CREATE NONCLUSTERED INDEX IX_QueueLog_QueueId ON dbo.QueueLog (QueueId);
GO

-- ==================== QUEUE LOG DETAIL ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'QueueLogDetail' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.QueueLogDetail (
    QueueLogDetailId   INT            IDENTITY(1,1) NOT NULL,
    QueueLogId         INT            NULL,
    QueueId            INT            NULL,
    DetailType         NVARCHAR(50)   NULL,
    StartDate          DATETIME       NULL,
    EndDate            DATETIME       NULL,
    Response           NVARCHAR(MAX)  NULL,
    ExceptionMessage   NVARCHAR(MAX)  NULL,
    IsSuccess          BIT            NULL,
    CONSTRAINT PK_QueueLogDetail PRIMARY KEY CLUSTERED (QueueLogDetailId ASC)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QueueLogDetail_QueueId' AND object_id = OBJECT_ID('dbo.QueueLogDetail'))
    CREATE NONCLUSTERED INDEX IX_QueueLogDetail_QueueId ON dbo.QueueLogDetail (QueueId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QueueLogDetail_QueueLogId' AND object_id = OBJECT_ID('dbo.QueueLogDetail'))
    CREATE NONCLUSTERED INDEX IX_QueueLogDetail_QueueLogId ON dbo.QueueLogDetail (QueueLogId);
GO

PRINT 'OrcaAlokasyon – Kuyruk tabloları oluşturuldu (Queue, QueueLog, QueueLogDetail).';
GO
