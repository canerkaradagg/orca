-- ============================================================
-- ORCA ASN Portalı – Portal tabloları (Inbound, ASN)
-- Union B2BPortal referanslı – OrcaAlokasyon tek DB
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ErrorLog (SaveErrorLog SP öncesi gerekli)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErrorLog' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ErrorLog (
    ErrorLogId   INT            IDENTITY(1,1) NOT NULL,
    ErrorMessage NVARCHAR(MAX)  NOT NULL,
    ErrorSource  NVARCHAR(200)  NULL,
    CreatedDate  DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_ErrorLog PRIMARY KEY (ErrorLogId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Inbound' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Inbound (
    InboundId           INT            IDENTITY(1,1) NOT NULL,
    CompanyCode         NVARCHAR(10)   NOT NULL,
    WarehouseCode       NVARCHAR(10)   NOT NULL,
    VendorCode          NVARCHAR(30)   NULL,
    ChannelTemplateCode NVARCHAR(30)   NULL,
    ImportFileNumber    NVARCHAR(30)   NULL,
    FileName            NVARCHAR(500)  NULL,
    UploadPath          NVARCHAR(1000) NULL,
    Status              NVARCHAR(20)   NOT NULL DEFAULT 'Taslak',
    InProgress          BIT            NOT NULL DEFAULT 0,
    CreatedUserId       NVARCHAR(50)   NULL,
    CreatedTime         DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Inbound PRIMARY KEY (InboundId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundLine' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundLine (
    InboundLineId INT          IDENTITY(1,1) NOT NULL,
    InboundId     INT          NOT NULL,
    PackageNumber NVARCHAR(30) NULL,
    PONumber      NVARCHAR(30) NULL,
    Barcode       NVARCHAR(30) NULL,
    Quantity      INT          NOT NULL DEFAULT 0,
    CONSTRAINT PK_InboundLine    PRIMARY KEY (InboundLineId),
    CONSTRAINT FK_InboundLine_Inbound FOREIGN KEY (InboundId) REFERENCES dbo.Inbound(InboundId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsn' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsn (
    InboundAsnId        INT            IDENTITY(1,1) NOT NULL,
    InboundId           INT            NULL,
    AsnNo               NVARCHAR(30)   NULL,
    IsReturn            BIT            NOT NULL DEFAULT 0,
    CompanyCode         NVARCHAR(10)   NULL,
    WarehouseCode       NVARCHAR(10)   NULL,
    VendorCode          NVARCHAR(30)   NULL,
    ReferenceInboundAsnId INT          NULL,
    ChannelTemplateCode NVARCHAR(256)  NULL,
    ImportFileNumber    NVARCHAR(256)  NULL,
    IsAllocation        BIT            NOT NULL DEFAULT 0,
    IsCollected         BIT            NOT NULL DEFAULT 0,
    CompletedDate       DATETIME       NULL,
    LastCheckDate       DATETIME       NULL,
    CONSTRAINT PK_InboundAsn    PRIMARY KEY (InboundAsnId),
    CONSTRAINT FK_InboundAsn_Inbound FOREIGN KEY (InboundId) REFERENCES dbo.Inbound(InboundId)
);
GO

-- InboundAsn mevcut tablo güncelleme (idempotent). IsQuarantine sütunu 18_DropIsQuarantine.sql ile en sonda kaldırılır.
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsn' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'IsReturn')
        ALTER TABLE dbo.InboundAsn ADD IsReturn BIT NOT NULL DEFAULT 0;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'ReferenceInboundAsnId')
        ALTER TABLE dbo.InboundAsn ADD ReferenceInboundAsnId INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'LastCheckDate')
        ALTER TABLE dbo.InboundAsn ADD LastCheckDate DATETIME NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsn') AND name = 'ProcessCode')
        ALTER TABLE dbo.InboundAsn ADD ProcessCode NVARCHAR(10) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnLine' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnLine (
    InboundAsnLineId    INT          IDENTITY(1,1) NOT NULL,
    InboundAsnId        INT          NULL,
    InboundLineId       INT          NULL,
    CaseCode            NVARCHAR(50) NULL,
    PurchaseOrderNo     NVARCHAR(50) NULL,
    ProductCode         NVARCHAR(50) NULL,
    EanCode             NVARCHAR(50) NULL,
    Quantity            INT          NULL,
    ColorCode           NVARCHAR(10) NULL,
    ItemDim1Code        NVARCHAR(10) NULL,
    ItemDim2Code        NVARCHAR(10) NULL,
    AdditionalQuantity  INT          NULL,
    ReceivedQuantity    INT          NULL,
    ITAtt03             NVARCHAR(50) NULL,
    CONSTRAINT PK_InboundAsnLine PRIMARY KEY (InboundAsnLineId)
);
GO

-- InboundAsnLine mevcut tablo güncelleme (idempotent)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnLine' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'CaseCode')
        ALTER TABLE dbo.InboundAsnLine ADD CaseCode NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'EanCode')
        ALTER TABLE dbo.InboundAsnLine ADD EanCode NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'AdditionalQuantity')
        ALTER TABLE dbo.InboundAsnLine ADD AdditionalQuantity INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'ReceivedQuantity')
        ALTER TABLE dbo.InboundAsnLine ADD ReceivedQuantity INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'ITAtt03')
        ALTER TABLE dbo.InboundAsnLine ADD ITAtt03 NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'PurchaseOrderNo')
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'PONumber')
            EXEC sp_rename 'dbo.InboundAsnLine.PONumber', 'PurchaseOrderNo', 'COLUMN';
        ELSE
            ALTER TABLE dbo.InboundAsnLine ADD PurchaseOrderNo NVARCHAR(50) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'ProductCode')
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'ItemCode')
            EXEC sp_rename 'dbo.InboundAsnLine.ItemCode', 'ProductCode', 'COLUMN';
        ELSE
            ALTER TABLE dbo.InboundAsnLine ADD ProductCode NVARCHAR(50) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'EanCode')
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnLine') AND name = 'Barcode')
            EXEC sp_rename 'dbo.InboundAsnLine.Barcode', 'EanCode', 'COLUMN';
        ELSE
            ALTER TABLE dbo.InboundAsnLine ADD EanCode NVARCHAR(50) NULL;
    END
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnCollected' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.InboundAsnCollected (
    InboundAsnCollectedId INT           IDENTITY(1,1) NOT NULL,
    InboundAsnId          INT           NULL,
    WmsSku                NVARCHAR(50)  NULL,
    ItemCode              NVARCHAR(30)  NULL,
    ColorCode             NVARCHAR(10)  NULL,
    ItemDim1Code          NVARCHAR(10)  NULL,
    ItemDim2Code          NVARCHAR(10)  NULL,
    Quantity              INT           NULL,
    PurchaseOrderNo       NVARCHAR(50)  NULL,
    ITAtt03               NVARCHAR(50)  NULL,
    CreatedDate           DATETIME      NOT NULL DEFAULT GETDATE(),
    [Timestamp]           NVARCHAR(50)  NULL,
    CONSTRAINT PK_InboundAsnCollected PRIMARY KEY (InboundAsnCollectedId)
);
GO

-- InboundAsnCollected mevcut tablo güncelleme (idempotent)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InboundAsnCollected' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'WmsSku')
        ALTER TABLE dbo.InboundAsnCollected ADD WmsSku NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'PurchaseOrderNo')
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'PONumber')
            EXEC sp_rename 'dbo.InboundAsnCollected.PONumber', 'PurchaseOrderNo', 'COLUMN';
        ELSE
            ALTER TABLE dbo.InboundAsnCollected ADD PurchaseOrderNo NVARCHAR(50) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'ITAtt03')
        ALTER TABLE dbo.InboundAsnCollected ADD ITAtt03 NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'CreatedDate')
        ALTER TABLE dbo.InboundAsnCollected ADD CreatedDate DATETIME NOT NULL DEFAULT GETDATE();
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InboundAsnCollected') AND name = 'Timestamp')
        ALTER TABLE dbo.InboundAsnCollected ADD [Timestamp] NVARCHAR(50) NULL;
END
GO

PRINT 'OrcaAlokasyon – Portal tabloları oluşturuldu.';
GO
