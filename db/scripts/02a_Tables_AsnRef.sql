-- ============================================================
-- ORCA ASN Portalı – ASN referans tabloları (Union B2BPortal uyumlu)
-- InboundAsnCase, InboundAsnLineRef, InboundAsnLineSourceHeader, InboundAsnLineSource
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== InboundAsnCase ====================
-- ASN bazında koli/lot listesi (CaseCode, LotCode).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnCase' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnCase (
    InboundAsnCaseId INT           IDENTITY(1,1) NOT NULL,
    InboundAsnId     INT           NULL,
    CaseCode         NVARCHAR(50)  NULL,
    LotCode          NVARCHAR(30)  NULL,
    CONSTRAINT PK_InboundAsnCase PRIMARY KEY CLUSTERED (InboundAsnCaseId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnCase_InboundAsnId' AND object_id = OBJECT_ID('dbo.InboundAsnCase'))
    CREATE NONCLUSTERED INDEX IX_InboundAsnCase_InboundAsnId ON dbo.InboundAsnCase (InboundAsnId);
GO

-- ==================== InboundAsnLineRef ====================
-- InboundAsnLine ↔ ERP OrderLine eşlemesi (izlenebilirlik, iptal için temel).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnLineRef' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnLineRef (
    InboundAsnLineRefId INT              IDENTITY(1,1) NOT NULL,
    InboundAsnLineId    INT              NULL,
    ProcessCode         NVARCHAR(5)      NULL,
    OrderLineId         UNIQUEIDENTIFIER NULL,
    Quantity            INT              NULL,
    IsNew               BIT              NOT NULL DEFAULT 0,
    CONSTRAINT PK_InboundAsnLineRef PRIMARY KEY CLUSTERED (InboundAsnLineRefId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnLineRef_InboundAsnLineId' AND object_id = OBJECT_ID('dbo.InboundAsnLineRef'))
    CREATE NONCLUSTERED INDEX IX_InboundAsnLineRef_InboundAsnLineId ON dbo.InboundAsnLineRef (InboundAsnLineId);
GO

-- ==================== InboundAsnLineSourceHeader ====================
-- ASN'e bağlı referans sipariş başlıkları (sipariş no, ProcessCode, cari, depo).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnLineSourceHeader' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnLineSourceHeader (
    InboundAsnLineSourceHeaderId INT              IDENTITY(1,1) NOT NULL,
    InboundAsnId                INT              NULL,
    ProcessCode                 NVARCHAR(10)    NULL,
    VendorCode                  NVARCHAR(30)    NULL,
    OrderDate                   DATE            NULL,
    OrderNumber                 NVARCHAR(30)    NULL,
    OrderHeaderId               UNIQUEIDENTIFIER NULL,
    IsCompleted                 BIT             NOT NULL DEFAULT 0,
    Description                 NVARCHAR(200)   NULL,
    DocCurrencyCode             NVARCHAR(10)   NULL,
    OfficeCode                  NVARCHAR(5)     NULL,
    PaymentTerm                 SMALLINT        NULL,
    WarehouseCode               NVARCHAR(10)   NULL,
    CONSTRAINT PK_InboundAsnLineSourceHeader PRIMARY KEY CLUSTERED (InboundAsnLineSourceHeaderId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnLineSourceHeader_InboundAsnId' AND object_id = OBJECT_ID('dbo.InboundAsnLineSourceHeader'))
    CREATE NONCLUSTERED INDEX IX_InboundAsnLineSourceHeader_InboundAsnId ON dbo.InboundAsnLineSourceHeader (InboundAsnId);
GO

-- ==================== InboundAsnLineSource ====================
-- ASN ↔ sipariş satırları (OrderLineId, miktar bilgisi).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnLineSource' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnLineSource (
    InboundAsnLineSourceId       INT              IDENTITY(1,1) NOT NULL,
    InboundAsnLineSourceHeaderId INT              NULL,
    InboundAsnId                 INT              NULL,
    OrderLineId                  UNIQUEIDENTIFIER NULL,
    OpenQuantity                 INT              NULL,
    RequiredQuantity             INT              NULL,
    ClosedQuantity               INT              NULL,
    DocCurrencyCode              NVARCHAR(10)     NULL,
    ItemCode                     NVARCHAR(30)     NULL,
    ColorCode                    NVARCHAR(10)     NULL,
    ItemDim1Code                 NVARCHAR(10)     NULL,
    ItemDim2Code                 NVARCHAR(10)     NULL,
    CONSTRAINT PK_InboundAsnLineSource PRIMARY KEY CLUSTERED (InboundAsnLineSourceId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnLineSource_InboundAsnId' AND object_id = OBJECT_ID('dbo.InboundAsnLineSource'))
    CREATE NONCLUSTERED INDEX IX_InboundAsnLineSource_InboundAsnId ON dbo.InboundAsnLineSource (InboundAsnId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnLineSource_HeaderId' AND object_id = OBJECT_ID('dbo.InboundAsnLineSource'))
    CREATE NONCLUSTERED INDEX IX_InboundAsnLineSource_HeaderId ON dbo.InboundAsnLineSource (InboundAsnLineSourceHeaderId);
GO

PRINT 'OrcaAlokasyon – ASN referans tabloları (InboundAsnCase, InboundAsnLineRef, InboundAsnLineSourceHeader, InboundAsnLineSource) oluşturuldu.';
GO
