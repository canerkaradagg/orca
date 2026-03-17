-- ============================================================
-- ORCA – Alokasyon sonrası kuyruk oluşmuyorsa teşhis
-- InboundAsnId'yi aşağıda kendi değerinizle değiştirin.
--
-- "Geçersiz sütun adı 'ItemDim3Code'" / "DraftOrder kullanılamadı" hatası alırsanız
-- önce 12a_View_DraftOrder.sql script'ini çalıştırın (view'ı günceller).
-- ============================================================
USE [OrcaAlokasyon]
GO

DECLARE @InboundAsnId INT = 1;  -- <-- Kendi InboundAsnId'nizi yazın

-- 1) Bu ASN'e ait Request ve DraftOrderHeader sayıları
SELECT N'Request' AS Tablo, COUNT(*) AS Adet FROM dbo.Request WHERE InboundAsnId = @InboundAsnId
UNION ALL
SELECT N'DraftOrderHeader', COUNT(*) FROM dbo.DraftOrderHeader doh
 WHERE doh.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId)
UNION ALL
SELECT N'DraftOrderLine', COUNT(*) FROM dbo.DraftOrderLine dol
 WHERE dol.DraftOrderHeaderId IN (SELECT DraftOrderHeaderId FROM dbo.DraftOrderHeader WHERE RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId));

-- 2) Reserve (5) için CreateQueueForAllocation'ın seçeceği kayıtlar (ReserveQueueId NULL, IsOrdered=1, IsPool=0)
SELECT doh.DraftOrderHeaderId, doh.RequestId, doh.ReserveQueueId, doh.IsOrdered, doh.IsPool
  FROM dbo.DraftOrderHeader doh
 WHERE doh.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId)
   AND doh.ReserveQueueId IS NULL
   AND doh.IsOrdered = 1
   AND doh.IsPool = 0;

-- 3) DraftOrder view'dan Reserve satırı geliyor mu? (ReserveJsonData NULL olmamalı)
SELECT do.DraftOrderHeaderId, do.RequestId, do.ReserveQueueId, do.IsOrdered, do.IsPool
      ,ReserveJsonLen = LEN(ISNULL(do.ReserveJsonData, N''))
  FROM dbo.DraftOrder do
  JOIN dbo.Request r ON r.RequestId = do.RequestId
 WHERE do.ReserveQueueId IS NULL AND do.IsOrdered = 1 AND do.IsPool = 0
   AND do.RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId);

-- 4) Kuyruk oluştur (bu scripti çalıştırdıktan sonra dbo.Queue'a bakın)
PRINT 'CreateQueueForAllocation çalıştırılıyor @InboundAsnId = ' + CAST(@InboundAsnId AS NVARCHAR(20));
EXEC dbo.CreateQueueForAllocation @InboundAsnId = @InboundAsnId;

-- 5) Bu ASN için Queue kayıtları
SELECT q.QueueId, q.SourceTypeId, q.SourceId, q.IsCompleted, q.TryCount
  FROM dbo.[Queue] q
 WHERE q.SourceId IN (SELECT DraftOrderHeaderId FROM dbo.DraftOrderHeader WHERE RequestId IN (SELECT RequestId FROM dbo.Request WHERE InboundAsnId = @InboundAsnId))
 ORDER BY q.QueueId;

GO
