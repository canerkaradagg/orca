-- ============================================================
-- ORCA ASN Portalı – Sistem parametreleri (Windows Service, kuyruk, bakım)
-- Parametre sayfası ve tetikleyiciler bu tablodan okur.
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SystemParameter' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.SystemParameter (
    ParameterKey   NVARCHAR(100)  NOT NULL,
    ParameterValue NVARCHAR(500)   NULL,
    Description    NVARCHAR(500)   NULL,
    UpdatedAt      DATETIME2      NULL,
    UpdatedBy      NVARCHAR(100)   NULL,
    CONSTRAINT PK_SystemParameter PRIMARY KEY (ParameterKey)
);
GO

-- Varsayılan parametreler (idempotent: sadece yoksa ekle)
IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'QueueProcessIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'QueueProcessIntervalMinutes', N'1', N'Kuyruk işleme tetikleyicisinin çalışma aralığı (dakika).');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'LogRetentionDays')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'LogRetentionDays', N'30', N'Kaç günden eski QueueLog/QueueLogDetail kayıtları silinecek.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaxTryCount')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaxTryCount', N'10', N'TryCount bu değere ulaştığında IsMaxTry=1 yapılacak (kaç denemede bırakılacak).');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'QueueBatchSize')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'QueueBatchSize', N'100', N'GetQueueList ile tek seferde kuyruktan çekilecek kayıt sayısı.');
ELSE
    UPDATE dbo.SystemParameter SET Description = N'GetQueueList ile tek seferde kuyruktan çekilecek kayıt sayısı.' WHERE ParameterKey = N'QueueBatchSize';

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'QueuePostChunkSize')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'QueuePostChunkSize', N'20', N'ERP''ye aynı anda (paralel) post edilecek kayıt sayısı. 0 veya boş = tüm batch ardışık. Örn: 100 çekip 20''şer post.');
ELSE
    UPDATE dbo.SystemParameter SET Description = N'ERP''ye aynı anda (paralel) post edilecek kayıt sayısı. 0 veya boş = tüm batch ardışık.' WHERE ParameterKey = N'QueuePostChunkSize';

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'DraftCleanupIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'DraftCleanupIntervalMinutes', N'1440', N'Draft temizlik job çalışma aralığı (dakika). 1440 = günde bir.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceReportEmail')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceReportEmail', N'caner.karadag@olka.com.tr', N'Bakım raporunun gönderileceği e-posta adresi.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'LogCleanupIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'LogCleanupIntervalMinutes', N'1440', N'Log temizlik job çalışma aralığı (dakika). 1440 = günde bir.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceRunIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceRunIntervalMinutes', N'1440', N'Bakım agent (index/stats, rapor) çalışma aralığı (dakika). 1440 = günde bir.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'UpdateReplenishmentIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'UpdateReplenishmentIntervalMinutes', N'60', N'ERP sevk senkron (UpdateReplenishment) çalışma aralığı (dakika). 0 = kapalı.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'SyncDispOrderFromErpIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'SyncDispOrderFromErpIntervalMinutes', N'0', N'Tam DispOrder senkron (SyncDispOrderFromErp) çalışma aralığı (dakika). 0 = kapalı.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'UpdateDispOrderHeaderCategorySeasonIntervalMinutes')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'UpdateDispOrderHeaderCategorySeasonIntervalMinutes', N'0', N'DispOrderHeader Category/Season/Brand toplu güncelleme aralığı (dakika). 0 = kapalı.');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'UpdateDispOrderHeaderCategorySeasonMaxRows')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'UpdateDispOrderHeaderCategorySeasonMaxRows', N'', N'Toplu güncellemede bir seferde işlenecek header sayısı üst limiti. Boş = sınırsız.');

-- Bakım sağlık kontrolü eşikleri (günlük kontrol; eşik aşılınca bakım önerisi veya uygulama)
IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceTableRowWarning')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceTableRowWarning', N'500000', N'Bu satır sayısını aşan tablolar için yedekleme/arşiv önerilir.');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceFragmentationPercent')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceFragmentationPercent', N'15', N'Bu oranın üzerinde fragmantasyon = REBUILD önerisi veya uygulaması.');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceStatisticsStaleDays')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceStatisticsStaleDays', N'7', N'İstatistik bu günden eskiyse güncelleme önerisi veya uygulaması.');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceRunFixWhenNeeded')
    INSERT INTO dbo.SystemParameter (ParameterKey, ParameterValue, Description) VALUES (N'MaintenanceRunFixWhenNeeded', N'1', N'1 = eşik aşıldığında REBUILD/UPDATE STATISTICS uygula; 0 = sadece raporla.');
GO
