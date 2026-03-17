-- ============================================================
-- ORCA ASN Portalı – OrcaAlokasyon DB İndeksler
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inbound_Status' AND object_id = OBJECT_ID('dbo.Inbound'))
    CREATE INDEX IX_Inbound_Status ON dbo.Inbound (Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inbound_Company' AND object_id = OBJECT_ID('dbo.Inbound'))
    CREATE INDEX IX_Inbound_Company ON dbo.Inbound (CompanyCode, VendorCode);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inbound_CreatedTime' AND object_id = OBJECT_ID('dbo.Inbound'))
    CREATE INDEX IX_Inbound_CreatedTime ON dbo.Inbound (CreatedTime DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundLine_InboundId' AND object_id = OBJECT_ID('dbo.InboundLine'))
    CREATE INDEX IX_InboundLine_InboundId ON dbo.InboundLine (InboundId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundLine_Barcode' AND object_id = OBJECT_ID('dbo.InboundLine'))
    CREATE INDEX IX_InboundLine_Barcode ON dbo.InboundLine (Barcode);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsn_InboundId' AND object_id = OBJECT_ID('dbo.InboundAsn'))
    CREATE INDEX IX_InboundAsn_InboundId ON dbo.InboundAsn (InboundId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsn_IsAllocation' AND object_id = OBJECT_ID('dbo.InboundAsn'))
    CREATE INDEX IX_InboundAsn_IsAllocation ON dbo.InboundAsn (IsAllocation) WHERE IsAllocation = 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnLine_AsnId' AND object_id = OBJECT_ID('dbo.InboundAsnLine'))
    CREATE INDEX IX_InboundAsnLine_AsnId ON dbo.InboundAsnLine (InboundAsnId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InboundAsnCollected_AsnId' AND object_id = OBJECT_ID('dbo.InboundAsnCollected'))
    CREATE INDEX IX_InboundAsnCollected_AsnId ON dbo.InboundAsnCollected (InboundAsnId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Request_InboundAsnId' AND object_id = OBJECT_ID('dbo.Request'))
    CREATE INDEX IX_Request_InboundAsnId ON dbo.Request (InboundAsnId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Request_StatusId' AND object_id = OBJECT_ID('dbo.Request'))
    CREATE INDEX IX_Request_StatusId ON dbo.Request (StatusId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_prItemBarcode_Company_Barcode' AND object_id = OBJECT_ID('dbo.prItemBarcode'))
    CREATE INDEX IX_prItemBarcode_Company_Barcode ON dbo.prItemBarcode (Company, Barcode) INCLUDE (ItemCode, ColorCode, ItemDim1Code, ItemDim2Code);
GO

PRINT 'OrcaAlokasyon – İndeksler oluşturuldu.';
GO
