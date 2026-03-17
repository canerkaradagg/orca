-- ============================================================
-- ORCA ASN Portalı – dbo.SaveErrorLog
-- ============================================================

USE [OrcaAlokasyon]
GO

CREATE OR ALTER PROCEDURE dbo.SaveErrorLog
    @ErrorMessage NVARCHAR(MAX),
    @ErrorSource  NVARCHAR(200) = NULL,
    @RaiseError   BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ErrorLog (ErrorMessage, ErrorSource, CreatedDate)
    VALUES (@ErrorMessage, @ErrorSource, GETDATE());

    IF @RaiseError = 1
        RAISERROR(@ErrorMessage, 16, 1);
END
GO

PRINT 'dbo.SaveErrorLog oluşturuldu.';
GO
