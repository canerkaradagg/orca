-- ============================================================
-- ORCA – Bir kerelik / projede artık kullanılmayan SP'leri kaldır
-- PatchQueueLogDetailResponse: Sadece manuel patch için kullanılıyordu; ürün akışında yok.
-- BackfillDispOrderFromDraft, BackfillReserveLineIdsForDraftOrder, RefreshQueueJsonDataForDraftOrder, ResetQueueForRetry: Bakım SP'leri kaldırıldı.
-- ============================================================

USE [OrcaAlokasyon]
GO

IF OBJECT_ID(N'dbo.PatchQueueLogDetailResponse', N'P') IS NOT NULL
    DROP PROCEDURE dbo.PatchQueueLogDetailResponse;
IF OBJECT_ID(N'dbo.BackfillDispOrderFromDraft', N'P') IS NOT NULL
    DROP PROCEDURE dbo.BackfillDispOrderFromDraft;
IF OBJECT_ID(N'dbo.BackfillReserveLineIdsForDraftOrder', N'P') IS NOT NULL
    DROP PROCEDURE dbo.BackfillReserveLineIdsForDraftOrder;
IF OBJECT_ID(N'dbo.RefreshQueueJsonDataForDraftOrder', N'P') IS NOT NULL
    DROP PROCEDURE dbo.RefreshQueueJsonDataForDraftOrder;
IF OBJECT_ID(N'dbo.ResetQueueForRetry', N'P') IS NOT NULL
    DROP PROCEDURE dbo.ResetQueueForRetry;
GO

PRINT 'Bir kerelik / kaldırılan SP''ler kaldırıldı.';
GO
