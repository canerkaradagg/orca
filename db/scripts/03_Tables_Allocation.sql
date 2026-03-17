-- ============================================================
-- ORCA ASN Portalı – Alokasyon tabloları
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== REQUEST ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Request' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Request (
    RequestId        INT            IDENTITY(1,1) NOT NULL,
    InboundAsnId     INT            NULL,
    Company          NVARCHAR(20)   NULL,
    ReferenceId      INT            NULL,
    IsReturn         BIT            NULL,
    AsnNo            NVARCHAR(30)   NULL,
    PurchaseOrderNo  NVARCHAR(50)   NULL,
    ItemCode         NVARCHAR(30)   NULL,
    ColorCode        NVARCHAR(10)   NULL,
    StatusId         INT            NULL,
    CreatedDate      DATETIME       NULL,
    AllocatedDate    DATETIME       NULL,
    CompletedDate    DATETIME       NULL,
    WarehouseCode    NVARCHAR(10)   NULL,
    Explanation      NVARCHAR(MAX)  NULL,
    ITAtt03          NVARCHAR(50)   NULL,
    Exception        BIT            NOT NULL DEFAULT 0,
    CONSTRAINT PK_Request PRIMARY KEY CLUSTERED (RequestId ASC)
);
GO

-- Mevcut Request tablosu: eksik sütunları ekle, eski adları yeni adlara çevir (idempotent)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Request' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'CreatedDate')
        ALTER TABLE dbo.Request ADD CreatedDate DATETIME NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'IsReturn')
        ALTER TABLE dbo.Request ADD IsReturn BIT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'WarehouseCode')
        ALTER TABLE dbo.Request ADD WarehouseCode NVARCHAR(10) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'ITAtt03')
        ALTER TABLE dbo.Request ADD ITAtt03 NVARCHAR(50) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'CompanyCode')
        EXEC sp_rename 'dbo.Request.CompanyCode', 'Company', 'COLUMN';
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Request') AND name = 'PONumber')
        EXEC sp_rename 'dbo.Request.PONumber', 'PurchaseOrderNo', 'COLUMN';
END
GO

-- ==================== RECEIVED ORDER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReceivedOrder' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ReceivedOrder (
    ReceivedOrderId      INT          IDENTITY(1,1) NOT NULL,
    RequestId            INT          NULL,
    LotCode              NVARCHAR(10) NULL,
    ItemDim1Code         NVARCHAR(10) NULL,
    ItemDim2Code         NVARCHAR(10) NULL,
    Quantity             INT          NULL,
    LotQuantity          INT          NULL,
    AllocationQuantity   INT          NULL,
    AllocationLotQuantity INT         NULL,
    UnpackQuantity       INT          NULL,
    UnpackLotQuantity    INT          NULL,
    OriginalQuantity     INT          NULL,
    CONSTRAINT PK_ReceivedOrder PRIMARY KEY CLUSTERED (ReceivedOrderId ASC)
);
GO

-- ==================== REFERENCE ORDER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReferenceOrder' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ReferenceOrder (
    ReferenceOrderId       INT                IDENTITY(1,1) NOT NULL,
    RequestId              INT                NULL,
    OrderHeaderId          UNIQUEIDENTIFIER   NULL,
    OrderLineId            UNIQUEIDENTIFIER   NULL,
    ProcessCode            NVARCHAR(5)        NULL,
    OrderNumber            NVARCHAR(30)       NULL,
    CurrAccTypeCode        TINYINT            NULL,
    CurrAccCode            NVARCHAR(30)       NULL,
    SubCurrAccId           UNIQUEIDENTIFIER   NULL,
    SubCurrAccCode         NVARCHAR(20)       NULL,
    PurchaseOrderNo        NVARCHAR(20)       NULL,
    LotCode                NVARCHAR(10)       NULL,
    ItemDim1Code           NVARCHAR(10)       NULL,
    ItemDim2Code           NVARCHAR(10)       NULL,
    OrderQuantity          INT                NULL,
    OpenQuantity           INT                NULL,
    CancelQuantity         INT                NULL,
    AllocationQuantity     INT                NULL,
    QueueId                INT                NULL,
    Description            NVARCHAR(200)      NULL,
    DocCurrencyCode        NVARCHAR(10)       NULL,
    OfficeCode             NVARCHAR(5)        NULL,
    PaymentTerm            SMALLINT           NULL,
    ShipmentMethodCode     NVARCHAR(10)       NULL,
    PaymentMethodCode      NVARCHAR(20)       NULL,
    IncotermCode1          NVARCHAR(5)        NULL,
    ATAtt01                NVARCHAR(50)       NULL,
    ATAtt02                NVARCHAR(50)       NULL,
    ITAtt01                NVARCHAR(50)       NULL,
    ITAtt02                NVARCHAR(50)       NULL,
    ITAtt03                NVARCHAR(50)       NULL,
    ITAtt04                NVARCHAR(50)       NULL,
    ShippingPostalAddressId UNIQUEIDENTIFIER  NULL,
    BillingPostalAddressId  UNIQUEIDENTIFIER  NULL,
    PoolQuantity           INT                NULL,
    OriginalOpenQuantity   INT                NULL,
    ITAtt05                NVARCHAR(50)       NULL,
    CONSTRAINT PK_ReferenceOrder PRIMARY KEY CLUSTERED (ReferenceOrderId ASC)
);
GO

-- ==================== DRAFT ORDER HEADER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DraftOrderHeader' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DraftOrderHeader (
    DraftOrderHeaderId      INT                IDENTITY(1,1) NOT NULL,
    RequestId               INT                NULL,
    ProcessCode             NVARCHAR(5)        NULL,
    CurrAccTypeCode         TINYINT            NULL,
    CurrAccCode             NVARCHAR(30)       NULL,
    SubCurrAccCode          NVARCHAR(30)       NULL,
    SubCurrAccId            UNIQUEIDENTIFIER   NULL,
    OrderQueueId            INT                NULL,
    ReserveQueueId          INT                NULL,
    DispOrderQueueId        INT                NULL,
    IsOrdered               BIT                NOT NULL DEFAULT 0,
    IsReserved              BIT                NOT NULL DEFAULT 0,
    IsDispOrdered           BIT                NOT NULL DEFAULT 0,
    Description             NVARCHAR(200)      NULL,
    OfficeCode              NVARCHAR(5)        NULL,
    PaymentTerm             SMALLINT           NULL,
    ShipmentMethodCode      NVARCHAR(10)       NULL,
    PaymentMethodCode       NVARCHAR(20)       NULL,
    IncotermCode1           NVARCHAR(5)        NULL,
    ATAtt01                 NVARCHAR(50)       NULL,
    ATAtt02                 NVARCHAR(50)       NULL,
    DocCurrencyCode         NVARCHAR(10)       NULL,
    OrderHeaderId           UNIQUEIDENTIFIER   NULL,
    ReserveHeaderId         UNIQUEIDENTIFIER   NULL,
    DispOrderHeaderId       UNIQUEIDENTIFIER   NULL,
    CountryCode             NVARCHAR(10)       NULL,
    ShippingPostalAddressId UNIQUEIDENTIFIER   NULL,
    BillingPostalAddressId  UNIQUEIDENTIFIER   NULL,
    IsPool                  BIT                NOT NULL DEFAULT 0,
    IsCompleted AS (CASE WHEN IsPool = 1 THEN IsOrdered ELSE IsDispOrdered END),
    WmsStatus               NVARCHAR(50)       NOT NULL DEFAULT N'',
    CONSTRAINT PK_DraftOrderHeader PRIMARY KEY CLUSTERED (DraftOrderHeaderId ASC)
);
GO

-- ==================== DRAFT ORDER LINE ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DraftOrderLine' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DraftOrderLine (
    DraftOrderLineId    INT                IDENTITY(1,1) NOT NULL,
    DraftOrderHeaderId  INT                NULL,
    DraftOrderLotId     INT                NULL,
    ItemDim1Code        NVARCHAR(10)       NULL,
    ItemDim2Code        NVARCHAR(10)       NULL,
    Quantity            INT                NULL,
    OrderLineId         UNIQUEIDENTIFIER   NULL,
    ReserveLineId       UNIQUEIDENTIFIER   NULL,
    DispOrderLineId     UNIQUEIDENTIFIER   NULL,
    DocCurrencyCode     NVARCHAR(10)       NULL,
    ITAtt01             NVARCHAR(50)       NULL,
    ITAtt02             NVARCHAR(50)       NULL,
    ITAtt03             NVARCHAR(50)       NULL,
    ITAtt04             NVARCHAR(50)       NULL,
    CONSTRAINT PK_DraftOrderLine PRIMARY KEY CLUSTERED (DraftOrderLineId ASC)
);
GO

-- ==================== DRAFT ORDER LOT ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DraftOrderLot' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DraftOrderLot (
    DraftOrderLotId     INT          IDENTITY(1,1) NOT NULL,
    DraftOrderHeaderId  INT          NULL,
    LotCode             NVARCHAR(10) NULL,
    LotQuantity         INT          NULL,
    CONSTRAINT PK_DraftOrderLot PRIMARY KEY CLUSTERED (DraftOrderLotId ASC)
);
GO

-- ==================== NEXT ORDER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'NextOrder' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.NextOrder (
    NextOrderId  INT          IDENTITY(1,1) NOT NULL,
    RequestId    INT          NOT NULL,
    ItemDim1Code NVARCHAR(10) NULL,
    ItemDim2Code NVARCHAR(10) NULL,
    OpenQuantity FLOAT        NULL,
    CONSTRAINT PK_NextOrder PRIMARY KEY CLUSTERED (NextOrderId ASC)
);
GO

-- ==================== OPEN ORDER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OpenOrder' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.OpenOrder (
    OpenOrderId      INT          IDENTITY(1,1) NOT NULL,
    RequestId        INT          NOT NULL,
    ItemDim1Code     NVARCHAR(10) NULL,
    ItemDim2Code     NVARCHAR(10) NULL,
    ITAtt05          NVARCHAR(50) NULL,
    OpenQuantity     FLOAT        NULL,
    ReceivedQuantity FLOAT        NULL,
    NextOrder        FLOAT        NULL,
    Less             FLOAT        NULL,
    OtherQuantity    FLOAT        NULL,
    CONSTRAINT PK_OpenOrder PRIMARY KEY CLUSTERED (OpenOrderId ASC)
);
GO

PRINT 'OrcaAlokasyon – Alokasyon tabloları oluşturuldu (referans uyumlu).';
GO
