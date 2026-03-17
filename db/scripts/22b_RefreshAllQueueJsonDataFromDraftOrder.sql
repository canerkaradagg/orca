-- ============================================================
-- ORCA – Tüm DraftOrder kaynaklı kuyruk kayıtlarının JsonData'sını
-- dbo.DraftOrder view'ından yenile (Order 4, Reserve 5, DispOrder 6).
-- View değişikliği (ör. StoreCode/ToStoreCode sadece ModelType 83) sonrası çalıştırın.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET NOCOUNT ON;

UPDATE q
SET q.JsonData = CASE q.SourceTypeId
    WHEN 4 THEN do.OrderJsonData
    WHEN 5 THEN do.ReserveJsonData
    WHEN 6 THEN do.DispOrderJsonData
    ELSE q.JsonData
END
FROM dbo.[Queue] q
INNER JOIN dbo.DraftOrder do ON do.DraftOrderHeaderId = q.SourceId
WHERE q.SourceTypeId IN (4, 5, 6);

PRINT 'Queue JsonData güncellendi (DraftOrder view''dan). Güncellenen: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));
GO
