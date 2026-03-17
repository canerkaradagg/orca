-- ============================================================
-- ORCA ASN Portalı – OrcaAlokasyon DB Şemalar
-- ext: ERP senkron tabloları (Windows servisi ile doldurulur)
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'ext')
    EXEC('CREATE SCHEMA ext');
GO

PRINT 'OrcaAlokasyon – Şemalar oluşturuldu.';
GO
