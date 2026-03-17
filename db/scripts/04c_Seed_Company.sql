-- ============================================================
-- ORCA ASN Portalı – cdCompany veri (Allocation referanslı)
-- Tablo: CompanyCode, CompanyName (Company, CompanyId opsiyonel)
-- Veriler bu versiyonda tutulur.
-- ============================================================

USE [OrcaAlokasyon]
GO

-- JUPITER
IF NOT EXISTS (SELECT 1 FROM dbo.cdCompany WHERE CompanyCode = N'JUPITER')
    INSERT INTO dbo.cdCompany (CompanyCode, CompanyName, Company, CompanyId) VALUES (N'JUPITER', N'JÜPITER MODA VE SPOR MALZEMELERİ TİCARET A.Ş.', N'JUPITER', NULL);
ELSE
    UPDATE dbo.cdCompany SET CompanyName = N'JÜPITER MODA VE SPOR MALZEMELERİ TİCARET A.Ş.', Company = N'JUPITER' WHERE CompanyCode = N'JUPITER';
GO

-- MARLIN
IF NOT EXISTS (SELECT 1 FROM dbo.cdCompany WHERE CompanyCode = N'MARLIN')
    INSERT INTO dbo.cdCompany (CompanyCode, CompanyName, Company, CompanyId) VALUES (N'MARLIN', N'MARLIN SPOR MALZEMELERI TICARET A.Ş.', N'MARLIN', NULL);
ELSE
    UPDATE dbo.cdCompany SET CompanyName = N'MARLIN SPOR MALZEMELERI TICARET A.Ş.', Company = N'MARLIN' WHERE CompanyCode = N'MARLIN';
GO

-- NEPTUN
IF NOT EXISTS (SELECT 1 FROM dbo.cdCompany WHERE CompanyCode = N'NEPTUN')
    INSERT INTO dbo.cdCompany (CompanyCode, CompanyName, Company, CompanyId) VALUES (N'NEPTUN', N'NEPTÜN SPOR MALZEMELERİ TİCARET A.Ş.', N'NEPTUN', NULL);
ELSE
    UPDATE dbo.cdCompany SET CompanyName = N'NEPTÜN SPOR MALZEMELERİ TİCARET A.Ş.', Company = N'NEPTUN' WHERE CompanyCode = N'NEPTUN';
GO

-- OLKA
IF NOT EXISTS (SELECT 1 FROM dbo.cdCompany WHERE CompanyCode = N'OLKA')
    INSERT INTO dbo.cdCompany (CompanyCode, CompanyName, Company, CompanyId) VALUES (N'OLKA', N'OLKA SPOR MALZEMELERİ TİC. A.Ş.', N'OLKA', NULL);
ELSE
    UPDATE dbo.cdCompany SET CompanyName = N'OLKA SPOR MALZEMELERİ TİC. A.Ş.', Company = N'OLKA' WHERE CompanyCode = N'OLKA';
GO

-- SATURN
IF NOT EXISTS (SELECT 1 FROM dbo.cdCompany WHERE CompanyCode = N'SATURN')
    INSERT INTO dbo.cdCompany (CompanyCode, CompanyName, Company, CompanyId) VALUES (N'SATURN', N'SATÜRN SPOR MALZEMELERİ TİCARET A.Ş.', N'SATURN', NULL);
ELSE
    UPDATE dbo.cdCompany SET CompanyName = N'SATÜRN SPOR MALZEMELERİ TİCARET A.Ş.', Company = N'SATURN' WHERE CompanyCode = N'SATURN';
GO

PRINT 'OrcaAlokasyon – cdCompany verileri güncellendi (JUPITER, MARLIN, NEPTUN, OLKA, SATURN).';
GO
