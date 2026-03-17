-- ============================================================
-- ORCA ASN Portalı – Master / lookup tabloları
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cdCompany' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.cdCompany (
    CompanyCode   NVARCHAR(10)  NOT NULL,
    CompanyName   NVARCHAR(100) NOT NULL,
    Company       NVARCHAR(10)  NULL,
    CompanyId     INT           NULL,
    CONSTRAINT PK_cdCompany PRIMARY KEY (CompanyCode)
);
GO

-- cdWarehouse artık tablo değil, ERP DB'lerinden okuyan bir view olarak tutulur.
-- Mevcut tablo varsa silinir, ardından view oluşturulur.
IF OBJECT_ID(N'dbo.cdWarehouse', N'U') IS NOT NULL
DROP TABLE dbo.cdWarehouse;
GO

CREATE OR ALTER VIEW dbo.cdWarehouse
AS
SELECT Company = N'OLKA',
       w.WarehouseCode,
       wd.WarehouseDescription,
       w.IsDefault,
       w.IsBlocked
  FROM OlkaV3.dbo.cdWarehouse w WITH (NOLOCK)
       LEFT JOIN OlkaV3.dbo.cdWarehouseDesc wd WITH (NOLOCK)
              ON wd.WarehouseCode = w.WarehouseCode
             AND wd.LangCode      = 'TR'
 WHERE w.WarehouseTypeCode = 1
   AND w.OfficeCode        = 'M'
UNION ALL
SELECT Company = N'MARLIN',
       w.WarehouseCode,
       wd.WarehouseDescription,
       w.IsDefault,
       w.IsBlocked
  FROM MARLINV3.dbo.cdWarehouse w WITH (NOLOCK)
       LEFT JOIN MARLINV3.dbo.cdWarehouseDesc wd WITH (NOLOCK)
              ON wd.WarehouseCode = w.WarehouseCode
             AND wd.LangCode      = 'TR'
 WHERE w.WarehouseTypeCode = 1
   AND w.OfficeCode        = 'M'
UNION ALL
SELECT Company = N'JUPITER',
       w.WarehouseCode,
       wd.WarehouseDescription,
       w.IsDefault,
       w.IsBlocked
  FROM JUPITERV3.dbo.cdWarehouse w WITH (NOLOCK)
       LEFT JOIN JUPITERV3.dbo.cdWarehouseDesc wd WITH (NOLOCK)
              ON wd.WarehouseCode = w.WarehouseCode
             AND wd.LangCode      = 'TR'
 WHERE w.WarehouseTypeCode = 1
   AND w.OfficeCode        = 'M'
UNION ALL
SELECT Company = N'NEPTUN',
       w.WarehouseCode,
       wd.WarehouseDescription,
       w.IsDefault,
       w.IsBlocked
  FROM NEPTUNV3.dbo.cdWarehouse w WITH (NOLOCK)
       LEFT JOIN NEPTUNV3.dbo.cdWarehouseDesc wd WITH (NOLOCK)
              ON wd.WarehouseCode = w.WarehouseCode
             AND wd.LangCode      = 'TR'
 WHERE w.WarehouseTypeCode = 1
   AND w.OfficeCode        = 'M'
UNION ALL
SELECT Company = N'SATURN',
       w.WarehouseCode,
       wd.WarehouseDescription,
       w.IsDefault,
       w.IsBlocked
  FROM SATURNV3.dbo.cdWarehouse w WITH (NOLOCK)
       LEFT JOIN SATURNV3.dbo.cdWarehouseDesc wd WITH (NOLOCK)
              ON wd.WarehouseCode = w.WarehouseCode
             AND wd.LangCode      = 'TR'
 WHERE w.WarehouseTypeCode = 1
   AND w.OfficeCode        = 'M';
GO

-- Vendor artık tablo değil, ERP DB'lerinden okuyan bir view olarak tutulur.
IF OBJECT_ID(N'dbo.Vendor', N'U') IS NOT NULL
DROP TABLE dbo.Vendor;
GO

CREATE OR ALTER VIEW dbo.Vendor
AS
SELECT Company          = N'OLKA',
       ca.CurrAccTypeCode,
       ca.CurrAccCode,
       cad.CurrAccDescription,
       ca.OfficeCode,
       ca.IsBlocked,
       ca.IsLocked
  FROM OlkaV3.dbo.cdCurrAcc ca WITH (NOLOCK)
       LEFT JOIN OlkaV3.dbo.cdCurrAccDesc cad WITH (NOLOCK)
              ON cad.CurrAccTypeCode = ca.CurrAccTypeCode
             AND cad.CurrAccCode     = ca.CurrAccCode
             AND cad.LangCode       = 'TR'
 WHERE ca.CurrAccTypeCode = 1
   AND ca.CurrAccCode    <> ''
   AND ca.OfficeCode     = N'M'
   AND ca.CompanyCode    = 1
UNION ALL
SELECT Company          = N'MARLIN',
       ca.CurrAccTypeCode,
       ca.CurrAccCode,
       cad.CurrAccDescription,
       ca.OfficeCode,
       ca.IsBlocked,
       ca.IsLocked
  FROM MARLINV3.dbo.cdCurrAcc ca WITH (NOLOCK)
       LEFT JOIN MARLINV3.dbo.cdCurrAccDesc cad WITH (NOLOCK)
              ON cad.CurrAccTypeCode = ca.CurrAccTypeCode
             AND cad.CurrAccCode     = ca.CurrAccCode
             AND cad.LangCode        = 'TR'
 WHERE ca.CurrAccTypeCode = 1
   AND ca.CurrAccCode    <> ''
   AND ca.OfficeCode     = N'M'
   AND ca.CompanyCode    = 1
UNION ALL
SELECT Company          = N'JUPITER',
       ca.CurrAccTypeCode,
       ca.CurrAccCode,
       cad.CurrAccDescription,
       ca.OfficeCode,
       ca.IsBlocked,
       ca.IsLocked
  FROM JUPITERV3.dbo.cdCurrAcc ca WITH (NOLOCK)
       LEFT JOIN JUPITERV3.dbo.cdCurrAccDesc cad WITH (NOLOCK)
              ON cad.CurrAccTypeCode = ca.CurrAccTypeCode
             AND cad.CurrAccCode     = ca.CurrAccCode
             AND cad.LangCode        = 'TR'
 WHERE ca.CurrAccTypeCode = 1
   AND ca.CurrAccCode    <> ''
   AND ca.OfficeCode     = N'M'
   AND ca.CompanyCode    = 1
UNION ALL
SELECT Company          = N'NEPTUN',
       ca.CurrAccTypeCode,
       ca.CurrAccCode,
       cad.CurrAccDescription,
       ca.OfficeCode,
       ca.IsBlocked,
       ca.IsLocked
  FROM NEPTUNV3.dbo.cdCurrAcc ca WITH (NOLOCK)
       LEFT JOIN NEPTUNV3.dbo.cdCurrAccDesc cad WITH (NOLOCK)
              ON cad.CurrAccTypeCode = ca.CurrAccTypeCode
             AND cad.CurrAccCode     = ca.CurrAccCode
             AND cad.LangCode        = 'TR'
 WHERE ca.CurrAccTypeCode = 1
   AND ca.CurrAccCode    <> ''
   AND ca.OfficeCode     = N'M'
   AND ca.CompanyCode    = 1
UNION ALL
SELECT Company          = N'SATURN',
       ca.CurrAccTypeCode,
       ca.CurrAccCode,
       cad.CurrAccDescription,
       ca.OfficeCode,
       ca.IsBlocked,
       ca.IsLocked
  FROM SaturnV3.dbo.cdCurrAcc ca WITH (NOLOCK)
       LEFT JOIN SaturnV3.dbo.cdCurrAccDesc cad WITH (NOLOCK)
              ON cad.CurrAccTypeCode = ca.CurrAccTypeCode
             AND cad.CurrAccCode     = ca.CurrAccCode
             AND cad.LangCode        = 'TR'
 WHERE ca.CurrAccTypeCode = 1
   AND ca.CurrAccCode    <> ''
   AND ca.OfficeCode     = N'M'
   AND ca.CompanyCode    = 1;
GO

-- ChannelTemplate / cdChannelTemplate / cdChannelTemplateCustomer artık tablo değil,
-- OlkaB2BPortal tarzı ERP DB'lerinden okuyan view'lar (linked server: OlkaV3, MARLINV3, ...).
IF OBJECT_ID(N'dbo.ChannelTemplate', N'U') IS NOT NULL   DROP TABLE dbo.ChannelTemplate;
IF OBJECT_ID(N'dbo.ChannelTemplate', N'V') IS NOT NULL   DROP VIEW dbo.ChannelTemplate;
GO
IF OBJECT_ID(N'dbo.cdChannelTemplate', N'U') IS NOT NULL DROP TABLE dbo.cdChannelTemplate;
IF OBJECT_ID(N'dbo.cdChannelTemplate', N'V') IS NOT NULL DROP VIEW dbo.cdChannelTemplate;
GO
IF OBJECT_ID(N'dbo.cdChannelTemplateCustomer', N'U') IS NOT NULL DROP TABLE dbo.cdChannelTemplateCustomer;
IF OBJECT_ID(N'dbo.cdChannelTemplateCustomer', N'V') IS NOT NULL DROP VIEW dbo.cdChannelTemplateCustomer;
GO

CREATE VIEW dbo.ChannelTemplate
AS
SELECT Company = N'OLKA', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM OlkaV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'MARLIN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM MARLINV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'JUPITER', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM JUPITERV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'NEPTUN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM NEPTUNV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'SATURN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM SaturnV3.dbo.cdChannelTemplate ct WITH (NOLOCK);
GO

CREATE VIEW dbo.cdChannelTemplate
AS
SELECT Company = N'OLKA', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM OlkaV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'MARLIN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM MARLINV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'JUPITER', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM JUPITERV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'NEPTUN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM NEPTUNV3.dbo.cdChannelTemplate ct WITH (NOLOCK)
UNION ALL
SELECT Company = N'SATURN', ct.ChannelTemplateCode, ct.ForAllocation, ct.IsBlocked
  FROM SaturnV3.dbo.cdChannelTemplate ct WITH (NOLOCK);
GO

-- cdChannelTemplateCustomer: ERP prChannelTemplateCurrAcc + prSubCurrAcc üzerinden linked server ile.
CREATE VIEW dbo.cdChannelTemplateCustomer
AS
SELECT Company          = N'OLKA'
      ,ctc.ChannelTemplateCode
      ,ctc.CurrAccTypeCode
      ,ctc.CurrAccCode
      ,sc.SubCurrAccID   AS SubCurrAccId
      ,sc.SubCurrAccCode
      ,ctc.SortOrder
      ,ctc.ChannelTypeCode
  FROM OlkaV3.dbo.prChannelTemplateCurrAcc ctc WITH (NOLOCK)
                LEFT JOIN OlkaV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
                    ON sc.SubCurrAccID = ctc.SubCurrAccID
 WHERE ctc.CompanyCode = 1
   AND ctc.CurrAccTypeCode IN (3,5)
UNION ALL
SELECT Company          = N'MARLIN'
      ,ctc.ChannelTemplateCode
      ,ctc.CurrAccTypeCode
      ,ctc.CurrAccCode
      ,sc.SubCurrAccID
      ,sc.SubCurrAccCode
      ,ctc.SortOrder
      ,ctc.ChannelTypeCode
  FROM MARLINV3.dbo.prChannelTemplateCurrAcc ctc WITH (NOLOCK)
                LEFT JOIN MARLINV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
                    ON sc.SubCurrAccID = ctc.SubCurrAccID
 WHERE ctc.CompanyCode = 1
   AND ctc.CurrAccTypeCode IN (3,5)
UNION ALL
SELECT Company          = N'JUPITER'
      ,ctc.ChannelTemplateCode
      ,ctc.CurrAccTypeCode
      ,ctc.CurrAccCode
      ,sc.SubCurrAccID
      ,sc.SubCurrAccCode
      ,ctc.SortOrder
      ,ctc.ChannelTypeCode
  FROM JUPITERV3.dbo.prChannelTemplateCurrAcc ctc WITH (NOLOCK)
                LEFT JOIN JUPITERV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
                    ON sc.SubCurrAccID = ctc.SubCurrAccID
 WHERE ctc.CompanyCode = 1
   AND ctc.CurrAccTypeCode IN (3,5)
UNION ALL
SELECT Company          = N'NEPTUN'
      ,ctc.ChannelTemplateCode
      ,ctc.CurrAccTypeCode
      ,ctc.CurrAccCode
      ,sc.SubCurrAccID
      ,sc.SubCurrAccCode
      ,ctc.SortOrder
      ,ctc.ChannelTypeCode
  FROM NEPTUNV3.dbo.prChannelTemplateCurrAcc ctc WITH (NOLOCK)
                LEFT JOIN NEPTUNV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
                    ON sc.SubCurrAccID = ctc.SubCurrAccID
 WHERE ctc.CompanyCode = 1
   AND ctc.CurrAccTypeCode IN (3,5)
UNION ALL
SELECT Company          = N'SATURN'
      ,ctc.ChannelTemplateCode
      ,ctc.CurrAccTypeCode
      ,ctc.CurrAccCode
      ,sc.SubCurrAccID
      ,sc.SubCurrAccCode
      ,ctc.SortOrder
      ,ctc.ChannelTypeCode
  FROM SaturnV3.dbo.prChannelTemplateCurrAcc ctc WITH (NOLOCK)
                LEFT JOIN SaturnV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
                    ON sc.SubCurrAccID = ctc.SubCurrAccID
 WHERE ctc.CompanyCode = 1
   AND ctc.CurrAccTypeCode IN (3,5);
GO

-- ChannelTemplateLine kaldırıldı; kullanılmıyordu.
IF OBJECT_ID(N'dbo.ChannelTemplateLine', N'U') IS NOT NULL
DROP TABLE dbo.ChannelTemplateLine;
GO

-- extChannelTemplate / extChannelTemplateCustomer kaldırıldı; veri view'lardan anlık okunur.
IF OBJECT_ID(N'dbo.extChannelTemplateCustomer', N'U') IS NOT NULL DROP TABLE dbo.extChannelTemplateCustomer;
IF OBJECT_ID(N'dbo.extChannelTemplate', N'U') IS NOT NULL DROP TABLE dbo.extChannelTemplate;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'prItemBarcode' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.prItemBarcode (
    Company           NVARCHAR(10)    NOT NULL,
    Barcode           NVARCHAR(30)    NOT NULL,
    BarcodeTypeCode   NVARCHAR(10)    NULL,
    ItemTypeCode      NVARCHAR(5)     NULL,
    ItemCode          NVARCHAR(30)    NULL,
    ColorCode         NVARCHAR(10)    NULL,
    ItemDim1Code      NVARCHAR(10)    NULL,
    ItemDim2Code      NVARCHAR(10)    NULL,
    UnitOfMeasureCode NVARCHAR(10)    NULL,
    Qty               DECIMAL(18,2)   NULL,
    CONSTRAINT PK_prItemBarcode PRIMARY KEY (Company, Barcode)
);
GO

PRINT 'OrcaAlokasyon – Master tabloları oluşturuldu.';
GO
