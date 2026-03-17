-- ============================================================
-- ModelType 83 (DispOrder) için RoundsmanCode, StoreCode, ToStoreCode
-- view'a eklendikten sonra mevcut kuyruk kayıtlarının JsonData'sını
-- güncellemek için tek seferlik patch.
-- Çalıştırma: 12a_View_DraftOrder.sql deploy edildikten sonra bu script'i çalıştırın.
-- ============================================================

USE [OrcaAlokasyon]
GO

SET NOCOUNT ON;

-- QueueId 346-359, 361-363 (DispOrder = SourceTypeId 6) için JsonData'yı
-- güncellenmiş DraftOrder.DispOrderJsonData ile yenile
UPDATE q
SET q.JsonData = do.DispOrderJsonData
FROM dbo.[Queue] q
INNER JOIN dbo.DraftOrder do ON do.DraftOrderHeaderId = q.SourceId
WHERE q.QueueId IN (
    346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359,
    361, 362, 363
)
  AND q.SourceTypeId = 6;

PRINT 'Queue DispOrder JsonData güncellendi (QueueId 346-359, 361-363). Güncellenen: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));
GO
