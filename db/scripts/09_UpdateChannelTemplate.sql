-- ============================================================
-- ORCA ASN Portalı – dbo.UpdateChannelTemplate
-- ChannelTemplate / cdChannelTemplate / cdChannelTemplateCustomer artık
-- ERP DB'lerinden okuyan view'lar olduğu için senkron (MERGE) yapılmaz.
-- Allocation SP bu prosedürü çağırmaya devam eder; no-op.
-- ============================================================

USE [OrcaAlokasyon]
GO

CREATE OR ALTER PROCEDURE dbo.UpdateChannelTemplate
AS
BEGIN
    SET NOCOUNT ON;
    -- Veri kaynağı: dbo.ChannelTemplate, dbo.cdChannelTemplate, dbo.cdChannelTemplateCustomer view'ları (ERP linked server).
END
GO

PRINT 'dbo.UpdateChannelTemplate oluşturuldu.';
GO
