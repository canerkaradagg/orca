-- ============================================================
-- ORCA ASN Portalı – Priority tablosu
-- Öncelikli ASN'lerin kuyrukta önce işlenmesi için (Union dbo.Priority mantığı).
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Priority' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Priority (
    PriorityId   INT           IDENTITY(1,1) NOT NULL,
    AsnNo        NVARCHAR(30)  NOT NULL,
    CreatedDate  DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Priority PRIMARY KEY CLUSTERED (PriorityId ASC)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Priority_AsnNo' AND object_id = OBJECT_ID('dbo.Priority'))
    CREATE UNIQUE NONCLUSTERED INDEX IX_Priority_AsnNo ON dbo.Priority (AsnNo);
GO

-- ==================== DispOrderLockCommand ====================
-- ERP trDispOrderHeader.IsLocked güncellemesi için komut kuyruğu (Union IsLocked mantığı).
-- Linked server veya ERP API yoksa bu tabloya yazılır; harici job/API ile ERP'ye uygulanır.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DispOrderLockCommand' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DispOrderLockCommand (
    DispOrderLockCommandId  INT              IDENTITY(1,1) NOT NULL,
    DispOrderHeaderId       UNIQUEIDENTIFIER NOT NULL,
    Company                 NVARCHAR(10)     NOT NULL,
    IsLocked                BIT              NOT NULL,
    CreatedAt               DATETIME         NOT NULL DEFAULT GETDATE(),
    AppliedAt               DATETIME         NULL,
    CONSTRAINT PK_DispOrderLockCommand PRIMARY KEY CLUSTERED (DispOrderLockCommandId ASC)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DispOrderLockCommand_AppliedAt' AND object_id = OBJECT_ID('dbo.DispOrderLockCommand'))
    CREATE NONCLUSTERED INDEX IX_DispOrderLockCommand_AppliedAt ON dbo.DispOrderLockCommand (AppliedAt) WHERE AppliedAt IS NULL;
GO

PRINT 'dbo.Priority ve dbo.DispOrderLockCommand tabloları oluşturuldu.';
GO
