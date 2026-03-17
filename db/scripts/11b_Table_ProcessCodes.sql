-- ============================================================
-- ORCA ASN Portalı – dbo.ProcessCodes tablosu
-- ModelType (ProcessCodeNo) referansı: Order/Reservation/DispOrder/OrderASN için ProcessCode eşlemesi.
-- ============================================================

USE [OrcaAlokasyon]
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProcessCodes' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ProcessCodes (
    Id                INT            IDENTITY(1,1) NOT NULL,
    ProcessCodeType   NVARCHAR(30)   NOT NULL,
    ProcessCode       NVARCHAR(10)   NOT NULL DEFAULT N'',
    ProcessCodeNo     INT            NULL,
    CancelReasonCode  NVARCHAR(10)   NULL,
    CONSTRAINT PK_ProcessCodes PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_ProcessCodes_Type_Code UNIQUE (ProcessCodeType, ProcessCode)
);
GO

-- Seed: OrderASN, Order, Reservation, DispOrder, NCR, NCR Cancel, ReturnWaybill (boş ProcessCode = N'')
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProcessCodes' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.ProcessCodes WHERE ProcessCodeType = N'OrderASN' AND ProcessCode = N'IP')
    BEGIN
        INSERT INTO dbo.ProcessCodes (ProcessCodeType, ProcessCode, ProcessCodeNo, CancelReasonCode) VALUES
         (N'OrderASN', N'IP', 97, N'002'),
         (N'OrderASN', N'BP', 95, N'002'),
         (N'Order', N'IP', 15, N'002'),
         (N'Order', N'BP', 9, N'002'),
         (N'Order', N'ES', 14, N'002'),
         (N'Order', N'DS', 12, N'002'),
         (N'Order', N'WS', 5, N'002'),
         (N'Order', N'S', 121, N'002'),
         (N'Reservation', N'ES', 63, N'002'),
         (N'Reservation', N'DS', 62, N'002'),
         (N'Reservation', N'WS', 67, N'002'),
         (N'Reservation', N'S', 66, N'002'),
         (N'DispOrder', N'ES', 80, N'002'),
         (N'DispOrder', N'DS', 79, N'002'),
         (N'DispOrder', N'S', 83, N'002'),
         (N'DispOrder', N'WS', 84, N'002'),
         (N'NCR', N'', 167, N'002'),
         (N'NCR Cancel', N'', NULL, NULL),
         (N'ReturnWaybill', N'', NULL, NULL);
    END
END
GO

PRINT 'dbo.ProcessCodes tablosu hazır.';
GO
