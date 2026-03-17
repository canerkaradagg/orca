-- ============================================================
-- ORCA – Finance modul tablolari
-- Union OlkaB2BPortal.dbo.* tablolarinin ORCA kopyalari
-- Performans: Kritik sorgulara uygun index'ler ekli
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== DISP ORDER STATUS ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DispOrderStatus' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DispOrderStatus (
    StatusId   INT           NOT NULL,
    StatusName NVARCHAR(50)  NOT NULL,
    IsFilter   BIT           NOT NULL DEFAULT 0,
    IsSelect   BIT           NOT NULL DEFAULT 0,
    SortOrder  INT           NOT NULL DEFAULT 0,
    CONSTRAINT PK_DispOrderStatus PRIMARY KEY CLUSTERED (StatusId)
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.DispOrderStatus WHERE StatusId = 0)
BEGIN
    INSERT INTO dbo.DispOrderStatus (StatusId, StatusName, IsFilter, IsSelect, SortOrder) VALUES
     (0, N'Boş',            1, 1, 10)
    ,(1, N'Bekle',          1, 1, 20)
    ,(2, N'Sevk Et',        1, 1, 30)
    ,(3, N'İrsaliyelenmiş', 1, 0, 40)
    ,(4, N'Faturalanmış',   1, 0, 50)
END
GO

-- ==================== DISP ORDER HEADER ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DispOrderHeader' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DispOrderHeader (
    DispOrderHeaderId         INT              IDENTITY(1,1) NOT NULL,
    Company                   NVARCHAR(10)     NOT NULL,
    SourceDispOrderHeaderId   UNIQUEIDENTIFIER NULL,
    DispOrderNumber           NVARCHAR(30)     NULL,
    DispOrderDate             DATETIME         NULL,
    CurrAccTypeCode           TINYINT          NULL,
    CurrAccCode               NVARCHAR(30)     NULL,
    SubCurrAccId              UNIQUEIDENTIFIER NULL,
    WarehouseCode             NVARCHAR(10)     NULL,
    DispOrderStatusId         INT              NOT NULL DEFAULT 0,
    StatusDate                DATETIME         NULL,
    Amount                    FLOAT            NULL,
    IsCollected               BIT              NOT NULL DEFAULT 0,
    Valid                     BIT              NOT NULL DEFAULT 1,
    DraftPickingListId        INT              NULL,
    RealPickingListId         INT              NULL,
    RequestId                 INT              NULL,
    Type                      NVARCHAR(20)     NULL,
    FinancialApproval         BIT              NOT NULL DEFAULT 0,
    FinancialApproveDate      DATETIME         NULL,
    FinancialApproveUserId    INT              NULL,
    WaitReason                NVARCHAR(512)    NULL,
    CountryCode               NVARCHAR(10)     NULL,
    ProcessCode               NVARCHAR(5)      NULL,
    ApproveSentDate           DATETIME         NULL,
    SasSentDate               DATETIME         NULL,
    AsnNo                     NVARCHAR(50)     NULL,
    SingleWaybill             BIT              NULL,
    CreatedDate               DATETIME         NOT NULL DEFAULT GETDATE(),
    ShipmentApproval          BIT              NOT NULL DEFAULT 0,
    ShipmentApproveDate       DATETIME         NULL,
    WarehouseStatus           NVARCHAR(30)     NULL,
    CollectedDate             DATETIME         NULL,
    IsPicked                  BIT              NOT NULL DEFAULT 0,
    PickedDate                DATETIME         NULL,
    BoxCount                  INT              NULL,
    Category                  NVARCHAR(50)     NULL,
    Season                    NVARCHAR(10)     NULL,
    Brand                     NVARCHAR(50)     NULL,
    SasResponse               NVARCHAR(MAX)    NULL,
    SasInfoSucceeded          BIT              NULL,
    SasInfoTryDate            DATETIME         NULL,
    WMS                       NVARCHAR(50)     NULL,
    OutboundCheckDate         DATETIME         NULL,
    CONSTRAINT PK_DispOrderHeader PRIMARY KEY CLUSTERED (DispOrderHeaderId)
);
GO

-- Performance indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOH_Company_CurrAcc' AND object_id = OBJECT_ID('dbo.DispOrderHeader'))
    CREATE NONCLUSTERED INDEX IX_DOH_Company_CurrAcc ON dbo.DispOrderHeader (Company, CurrAccCode) INCLUDE (DispOrderStatusId, Valid, DispOrderDate, FinancialApproval);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOH_Company_Status_Valid' AND object_id = OBJECT_ID('dbo.DispOrderHeader'))
    CREATE NONCLUSTERED INDEX IX_DOH_Company_Status_Valid ON dbo.DispOrderHeader (Company, DispOrderStatusId, Valid) INCLUDE (CurrAccCode, DispOrderDate, Amount);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOH_DraftPickingListId' AND object_id = OBJECT_ID('dbo.DispOrderHeader'))
    CREATE NONCLUSTERED INDEX IX_DOH_DraftPickingListId ON dbo.DispOrderHeader (DraftPickingListId) WHERE DraftPickingListId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOH_RealPickingListId' AND object_id = OBJECT_ID('dbo.DispOrderHeader'))
    CREATE NONCLUSTERED INDEX IX_DOH_RealPickingListId ON dbo.DispOrderHeader (RealPickingListId) WHERE RealPickingListId IS NOT NULL;
GO

-- Sevk emri bazlı SAS no (SingleWaybill listelerde 1 sevk 1 SAS)
IF COL_LENGTH('dbo.DispOrderHeader', 'CustomerSASNo') IS NULL
    ALTER TABLE dbo.DispOrderHeader ADD CustomerSASNo NVARCHAR(50) NULL;
GO

-- ==================== DISP ORDER LINE ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DispOrderLine' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DispOrderLine (
    DispOrderLineId           INT              IDENTITY(1,1) NOT NULL,
    DispOrderHeaderId         INT              NOT NULL,
    Company                   NVARCHAR(10)     NULL,
    SourceDispOrderLineId     UNIQUEIDENTIFIER NULL,
    ItemTypeCode              TINYINT          NULL,
    ItemCode                  NVARCHAR(30)     NULL,
    ColorCode                 NVARCHAR(10)     NULL,
    ItemDim1Code              NVARCHAR(10)     NULL,
    ItemDim2Code              NVARCHAR(10)     NULL,
    Qty1                      DECIMAL(18,6)    NULL,
    ShipmentQuantity          DECIMAL(18,6)    NULL,
    Valid                     BIT              NOT NULL DEFAULT 1,
    BaseListPrice             MONEY            NULL,
    ListPrice                 MONEY            NULL,
    ListPriceDate             DATETIME         NULL,
    VatRate                   REAL             NULL,
    Markup                    REAL             NULL,
    OrderLineId               UNIQUEIDENTIFIER NULL,
    Barcode                   NVARCHAR(30)     NULL,
    ITAtt02                   NVARCHAR(50)     NULL,
    BaseAmount AS (ISNULL(Qty1, 0) * ISNULL(BaseListPrice, 0)) PERSISTED,
    TotalAmount AS (ISNULL(Qty1, 0) * ISNULL(ListPrice, 0)) PERSISTED,
    TotalShipmentAmount AS (ISNULL(ShipmentQuantity, 0) * ISNULL(ListPrice, 0)) PERSISTED,
    CONSTRAINT PK_DispOrderLine PRIMARY KEY CLUSTERED (DispOrderLineId),
    CONSTRAINT FK_DOL_Header FOREIGN KEY (DispOrderHeaderId) REFERENCES dbo.DispOrderHeader(DispOrderHeaderId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOL_HeaderId' AND object_id = OBJECT_ID('dbo.DispOrderLine'))
    CREATE NONCLUSTERED INDEX IX_DOL_HeaderId ON dbo.DispOrderLine (DispOrderHeaderId) INCLUDE (Qty1, ShipmentQuantity, BaseAmount, TotalAmount);
GO

-- ==================== DISP ORDER CASE ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DispOrderCase' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.DispOrderCase (
    DispOrderCaseId    INT           IDENTITY(1,1) NOT NULL,
    DispOrderHeaderId  INT           NOT NULL,
    CaseId             INT           NULL,
    CaseCode           NVARCHAR(50)  NULL,
    ApproveDate        DATETIME      NULL,
    ShipmentQuantity   FLOAT         NULL,
    CustomerSASNo      NVARCHAR(50)  NULL,
    V3SentDate         DATETIME      NULL,
    CONSTRAINT PK_DispOrderCase PRIMARY KEY CLUSTERED (DispOrderCaseId),
    CONSTRAINT FK_DOC_Header FOREIGN KEY (DispOrderHeaderId) REFERENCES dbo.DispOrderHeader(DispOrderHeaderId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DOC_HeaderId' AND object_id = OBJECT_ID('dbo.DispOrderCase'))
    CREATE NONCLUSTERED INDEX IX_DOC_HeaderId ON dbo.DispOrderCase (DispOrderHeaderId);
GO

-- ==================== PICKING LISTS ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PickingLists' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.PickingLists (
    PickingListId       INT            IDENTITY(1,1) NOT NULL,
    ListType            TINYINT        NOT NULL DEFAULT 1,
    PickingDate         DATETIME       NULL,
    Description         NVARCHAR(MAX)  NULL,
    Company             NVARCHAR(10)   NOT NULL,
    CustomerCode        VARCHAR(30)    NULL,
    Status              TINYINT        NOT NULL DEFAULT 1,
    CreatedUserId       INT            NULL,
    CreatedTime         DATETIME       NOT NULL DEFAULT GETDATE(),
    CustomerSASNo       VARCHAR(50)    NULL,
    CustomerRequestDate DATETIME       NULL,
    CustomerNote        NVARCHAR(MAX)  NULL,
    SingleWaybill       BIT            NULL,
    ApproveDate         DATETIME       NULL,
    RejectDate          DATETIME       NULL,
    CancelDate          DATETIME       NULL,
    CONSTRAINT PK_PickingLists PRIMARY KEY CLUSTERED (PickingListId)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PL_Company_Customer' AND object_id = OBJECT_ID('dbo.PickingLists'))
    CREATE NONCLUSTERED INDEX IX_PL_Company_Customer ON dbo.PickingLists (Company, CustomerCode) INCLUDE (Status, CreatedTime);
GO

-- ==================== PICKING LIST STATUS (View) ====================
IF OBJECT_ID('dbo.PickingListStatus', 'V') IS NOT NULL
    DROP VIEW dbo.PickingListStatus;
GO
CREATE VIEW dbo.PickingListStatus AS
SELECT StatusId = CAST(j.StatusId AS INT),
       Status   = CAST(j.Status AS NVARCHAR(30)),
       CustomerApprove = CAST(j.CustomerApprove AS INT)
  FROM (VALUES
    (1, N'Taslak',         0),
    (2, N'Onay Bekliyor',  0),
    (3, N'Onaylı',         1),
    (4, N'Red',            0),
    (5, N'İptal',          0)
  ) j (StatusId, Status, CustomerApprove);
GO

-- ==================== REPORT EXCEPTION ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReportException' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ReportException (
    ReportExceptionId  INT           IDENTITY(1,1) NOT NULL,
    Company            NVARCHAR(10)  NOT NULL,
    CurrAccCode        NVARCHAR(30)  NOT NULL,
    CONSTRAINT PK_ReportException PRIMARY KEY CLUSTERED (ReportExceptionId)
);
GO

PRINT 'Finance tabloları oluşturuldu.';
GO
