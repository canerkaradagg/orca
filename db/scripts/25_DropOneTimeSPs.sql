-- ============================================================
-- ORCA – Bir kerelik / projede artık kullanılmayan SP'leri kaldır
-- PatchQueueLogDetailResponse: Sadece manuel patch için kullanılıyordu; ürün akışında yok.
-- ============================================================

USE [OrcaAlokasyon]
GO

IF OBJECT_ID(N'dbo.PatchQueueLogDetailResponse', N'P') IS NOT NULL
    DROP PROCEDURE dbo.PatchQueueLogDetailResponse;
GO

PRINT 'Bir kerelik SP''ler (PatchQueueLogDetailResponse) kaldırıldı.';
GO
