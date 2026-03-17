-- ============================================================
-- ORCA ASN Portalı – Exception Store List (Union uyumlu)
-- Parametre sayfasından doldurulur; Allocation'da Exception mantığı için kullanılır.
-- ============================================================

USE [OrcaAlokasyon]
GO

-- Tablo: Exception store (cari) listesi
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ExceptionStore' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ExceptionStore (
    CurrAccTypeCode TINYINT       NOT NULL,
    CurrAccCode     NVARCHAR(30)  NOT NULL,
    CONSTRAINT PK_ExceptionStore PRIMARY KEY (CurrAccTypeCode, CurrAccCode)
);
GO

-- View: Union'daki ExceptionStoreList ile aynı yapı (CurrAccTypeCode, CurrAccCode)
IF OBJECT_ID('dbo.ExceptionStoreList','V') IS NOT NULL
    DROP VIEW dbo.ExceptionStoreList;
GO
CREATE VIEW dbo.ExceptionStoreList AS
SELECT CurrAccTypeCode
      ,CurrAccCode
  FROM dbo.ExceptionStore;
GO

PRINT 'ExceptionStore tablosu ve ExceptionStoreList view oluşturuldu.';
GO
