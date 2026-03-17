-- ============================================================
-- ORCA – ERP veritabanlarında Change Tracking etkinleştirme
-- UpdateReplenishment SP'nin çalışması için ÖNCE bu script
-- her ERP veritabanında (OlkaV3, MARLINV3, JUPITERV3, NEPTUNV3, SaturnV3)
-- çalıştırılmalı.
-- ERP veritabanları OrcaAlokasyon ile aynı SQL Server instance'da olmalı.
--
-- NOT: Bu script run-scripts.cjs ile ÇALIŞTIRILMAZ (OrcaAlokasyon bağlantısı
-- ERP DB'lere ALTER yetkisi gerektirir / ERP ayrı sunucuda olabilir).
-- Gerekirse ERP sunucusunda SSMS veya sqlcmd ile manuel çalıştırın.
-- ============================================================

-- OlkaV3 (tek batch: USE + aşağıdaki tüm ifadeler aynı bağlantıda çalışır)
USE [OlkaV3];
IF ISNULL(DATABASEPROPERTYEX('OlkaV3', 'IsChangeTrackingOn'), 0) = 0
BEGIN
    ALTER DATABASE [OlkaV3] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON);
    PRINT 'OlkaV3: Change Tracking etkinleştirildi.';
END
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderHeader'))
    ALTER TABLE dbo.trDispOrderHeader ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderLine'))
    ALTER TABLE dbo.trDispOrderLine ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
PRINT 'OlkaV3: trDispOrderHeader, trDispOrderLine Change Tracking OK.';
GO

-- MARLINV3
USE [MARLINV3];
IF ISNULL(DATABASEPROPERTYEX('MARLINV3', 'IsChangeTrackingOn'), 0) = 0
BEGIN
    ALTER DATABASE [MARLINV3] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON);
    PRINT 'MARLINV3: Change Tracking etkinleştirildi.';
END
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderHeader'))
    ALTER TABLE dbo.trDispOrderHeader ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderLine'))
    ALTER TABLE dbo.trDispOrderLine ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
PRINT 'MARLINV3: trDispOrderHeader, trDispOrderLine Change Tracking OK.';
GO

-- JUPITERV3
USE [JUPITERV3];
IF ISNULL(DATABASEPROPERTYEX('JUPITERV3', 'IsChangeTrackingOn'), 0) = 0
BEGIN
    ALTER DATABASE [JUPITERV3] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON);
    PRINT 'JUPITERV3: Change Tracking etkinleştirildi.';
END
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderHeader'))
    ALTER TABLE dbo.trDispOrderHeader ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderLine'))
    ALTER TABLE dbo.trDispOrderLine ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
PRINT 'JUPITERV3: trDispOrderHeader, trDispOrderLine Change Tracking OK.';
GO

-- NEPTUNV3
USE [NEPTUNV3];
IF ISNULL(DATABASEPROPERTYEX('NEPTUNV3', 'IsChangeTrackingOn'), 0) = 0
BEGIN
    ALTER DATABASE [NEPTUNV3] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON);
    PRINT 'NEPTUNV3: Change Tracking etkinleştirildi.';
END
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderHeader'))
    ALTER TABLE dbo.trDispOrderHeader ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderLine'))
    ALTER TABLE dbo.trDispOrderLine ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
PRINT 'NEPTUNV3: trDispOrderHeader, trDispOrderLine Change Tracking OK.';
GO

-- SaturnV3
USE [SaturnV3];
IF ISNULL(DATABASEPROPERTYEX('SaturnV3', 'IsChangeTrackingOn'), 0) = 0
BEGIN
    ALTER DATABASE [SaturnV3] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON);
    PRINT 'SaturnV3: Change Tracking etkinleştirildi.';
END
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderHeader'))
    ALTER TABLE dbo.trDispOrderHeader ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.trDispOrderLine'))
    ALTER TABLE dbo.trDispOrderLine ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = OFF);
PRINT 'SaturnV3: trDispOrderHeader, trDispOrderLine Change Tracking OK.';
GO

PRINT 'Tüm ERP veritabanlarında Change Tracking etkinleştirildi.';
GO
