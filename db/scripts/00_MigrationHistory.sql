-- ============================================================
-- ORCA – Migration History (hangi script'in çalıştığını takip eder)
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '_MigrationHistory' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo._MigrationHistory (
    ScriptName   NVARCHAR(200)  NOT NULL,
    AppliedAt    DATETIME       NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_MigrationHistory PRIMARY KEY (ScriptName)
);
GO

PRINT '_MigrationHistory tablosu oluşturuldu.';
GO
