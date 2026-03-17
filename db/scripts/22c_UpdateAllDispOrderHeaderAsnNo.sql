-- ============================================================
-- ORCA – Tüm DispOrderHeader kayıtlarında AsnNo (ve RequestId) güncelle
-- DraftOrderHeader -> Request bağlantısı ile; SourceDispOrderHeaderId = ERP header id.
-- Tek seferlik backfill; sonrasında 23/24 zaten güncel tutar.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET NOCOUNT ON;

UPDATE doh SET
    doh.RequestId = r.RequestId,
    doh.AsnNo     = r.AsnNo
FROM dbo.DispOrderHeader doh WITH (NOLOCK)
INNER JOIN dbo.DraftOrderHeader dh ON dh.DispOrderHeaderId = doh.SourceDispOrderHeaderId
INNER JOIN dbo.Request r ON r.RequestId = dh.RequestId
WHERE doh.SourceDispOrderHeaderId IS NOT NULL;

PRINT 'DispOrderHeader AsnNo/RequestId güncellendi. Güncellenen: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));
GO
