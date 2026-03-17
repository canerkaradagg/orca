-- ============================================================
-- ORCA – DispOrderHeader / DispOrderLine tablolarını ERP'den güncelle
-- ext.DispOrderHeader ve ext.DispOrderLine view'larından dbo tablolarını senkronize eder.
-- SSMS'te bu dosyayı çalıştırın.
-- ============================================================

USE [OrcaAlokasyon]
GO

EXEC dbo.SyncDispOrderFromErp;
GO

PRINT 'DispOrderHeader ve DispOrderLine güncellemesi tamamlandı.';
GO
