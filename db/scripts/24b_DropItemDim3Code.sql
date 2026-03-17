-- ============================================================
-- ORCA – ItemDim3Code sütununu mevcut tablolardan kaldır
-- ItemDim1Code yeterli; bu migration eski kurulumlarda sütunu drop eder
-- ============================================================

USE [OrcaAlokasyon]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DispOrderLine') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.DispOrderLine DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReceivedOrder') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.ReceivedOrder DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ReferenceOrder') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.ReferenceOrder DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DraftOrderLine') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.DraftOrderLine DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NextOrder') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.NextOrder DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.OpenOrder') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.OpenOrder DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.InboundAsnLine DROP COLUMN ItemDim3Code;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.InboundAsnCollected DROP COLUMN ItemDim3Code;
-- prItemBarcode: indeks ItemDim3Code'ya bağımlı olabilir, önce indeksi kaldır
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prItemBarcode_Company_Barcode' AND object_id = OBJECT_ID('dbo.prItemBarcode'))
    DROP INDEX IX_prItemBarcode_Company_Barcode ON dbo.prItemBarcode;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.prItemBarcode') AND name = 'ItemDim3Code')
    ALTER TABLE dbo.prItemBarcode DROP COLUMN ItemDim3Code;
-- Indeksi yeniden oluştur (06_Indexes ile uyumlu, ItemDim3Code olmadan)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prItemBarcode_Company_Barcode' AND object_id = OBJECT_ID('dbo.prItemBarcode'))
    CREATE INDEX IX_prItemBarcode_Company_Barcode ON dbo.prItemBarcode (Company, Barcode) INCLUDE (ItemCode, ColorCode, ItemDim1Code, ItemDim2Code);
GO

PRINT 'ItemDim3Code sütunları kaldırıldı.';
GO
