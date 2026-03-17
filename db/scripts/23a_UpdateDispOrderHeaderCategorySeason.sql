-- ============================================================
-- ORCA – DispOrderHeader Category / Season / Brand güncelleme (set-based)
-- Union UpdateCategoryFromV3 mantığı; cursor yerine tek/iki toplu UPDATE ile kilit ve süre azaltılır.
-- Season: DispOrderLine.ITAtt02 → STRING_AGG. Category/Brand: ext.Item varsa ProductHierarchyLevel02/01.
-- ============================================================

USE [OrcaAlokasyon]
GO

-- STRING_AGG(ITAtt02) birden fazla sezon için uzun olabilir; Union ile uyum için genişlet
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DispOrderHeader') AND name = 'Season')
        ALTER TABLE dbo.DispOrderHeader ALTER COLUMN Season NVARCHAR(200) NULL;
END
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ==================== UpdateDispOrderHeaderCategorySeason ====================
-- Tekil: @DispOrderHeaderId dolu ise sadece o header güncellenir (örn. InsertDispOrders sonrası).
-- Toplu: @DispOrderHeaderId NULL ise Season/Category/Brand eksik header'lar set-based güncellenir; @MaxRows ile sınırlanabilir.
CREATE OR ALTER PROCEDURE dbo.UpdateDispOrderHeaderCategorySeason
    @DispOrderHeaderId INT = NULL,   -- NULL = toplu (eksik olanlar); dolu = sadece bu header
    @MaxRows           INT = NULL   -- Toplu modda güncellenecek maksimum header sayısı (kilit süresini sınırlamak için)
AS
BEGIN
    SET NOCOUNT ON;

    -- ----- 1) Season: DispOrderLine.ITAtt02 → STRING_AGG (cursor yok, tek UPDATE) -----
    IF @DispOrderHeaderId IS NOT NULL
    BEGIN
        UPDATE doh SET doh.Season = agg.Season
        FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
        OUTER APPLY (
            SELECT Season = STRING_AGG(ITAtt02, N',') WITHIN GROUP (ORDER BY ITAtt02)
            FROM (SELECT DISTINCT dol.ITAtt02
                  FROM dbo.DispOrderLine dol WITH (NOLOCK)
                  WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId
                    AND ISNULL(dol.ITAtt02, N'') != N'') a
        ) agg
        WHERE doh.DispOrderHeaderId = @DispOrderHeaderId
          AND agg.Season IS NOT NULL;
    END
    ELSE
    BEGIN
        ;WITH target AS (
            SELECT TOP (ISNULL(NULLIF(@MaxRows, 0), 2147483647))
                   doh.DispOrderHeaderId
            FROM dbo.DispOrderHeader doh WITH (NOLOCK)
            WHERE doh.Season IS NULL OR doh.Category IS NULL OR doh.Brand IS NULL
            ORDER BY doh.DispOrderHeaderId DESC
        ),
        aggSeason AS (
            SELECT dol.DispOrderHeaderId,
                   Season = STRING_AGG(dol.ITAtt02, N',') WITHIN GROUP (ORDER BY dol.ITAtt02)
            FROM (SELECT DISTINCT DispOrderHeaderId, ITAtt02
                  FROM dbo.DispOrderLine WITH (NOLOCK)
                  WHERE ISNULL(ITAtt02, N'') != N'') dol
            INNER JOIN target t ON t.DispOrderHeaderId = dol.DispOrderHeaderId
            GROUP BY dol.DispOrderHeaderId
        )
        UPDATE doh SET doh.Season = a.Season
        FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
        INNER JOIN aggSeason a ON a.DispOrderHeaderId = doh.DispOrderHeaderId
        WHERE a.Season IS NOT NULL;
    END

    -- ----- 2) Category / Brand: ext.Item varsa ProductHierarchyLevel02/01 (set-based) -----
    IF OBJECT_ID(N'ext.Item', N'V') IS NULL
        RETURN;

    IF @DispOrderHeaderId IS NOT NULL
    BEGIN
        UPDATE doh SET doh.Category = agg.Category, doh.Brand = agg.Brand
        FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
        OUTER APPLY (
            SELECT Category = STRING_AGG(ProductHierarchyLevel02, N',') WITHIN GROUP (ORDER BY ProductHierarchyLevel02),
                   Brand   = STRING_AGG(ProductHierarchyLevel01, N',') WITHIN GROUP (ORDER BY ProductHierarchyLevel01)
            FROM (SELECT DISTINCT i.ProductHierarchyLevel02, i.ProductHierarchyLevel01
                  FROM dbo.DispOrderLine dol WITH (NOLOCK)
                  INNER JOIN ext.Item i WITH (NOLOCK) ON i.Company = dol.Company AND i.ItemCode = dol.ItemCode
                  WHERE dol.DispOrderHeaderId = doh.DispOrderHeaderId
                    AND (ISNULL(i.ProductHierarchyLevel02, N'') != N'' OR ISNULL(i.ProductHierarchyLevel01, N'') != N'')) a
        ) agg
        WHERE doh.DispOrderHeaderId = @DispOrderHeaderId
          AND (agg.Category IS NOT NULL OR agg.Brand IS NOT NULL);
    END
    ELSE
    BEGIN
        ;WITH target AS (
            SELECT TOP (ISNULL(NULLIF(@MaxRows, 0), 2147483647))
                   doh.DispOrderHeaderId
            FROM dbo.DispOrderHeader doh WITH (NOLOCK)
            WHERE doh.Season IS NULL OR doh.Category IS NULL OR doh.Brand IS NULL
            ORDER BY doh.DispOrderHeaderId DESC
        ),
        aggCategory AS (
            SELECT dol.DispOrderHeaderId,
                   Category = STRING_AGG(dol.ph02, N',') WITHIN GROUP (ORDER BY dol.ph02)
            FROM (SELECT DISTINCT dol2.DispOrderHeaderId, ISNULL(i2.ProductHierarchyLevel02, N'') AS ph02
                  FROM dbo.DispOrderLine dol2 WITH (NOLOCK)
                  INNER JOIN ext.Item i2 WITH (NOLOCK) ON i2.Company = dol2.Company AND i2.ItemCode = dol2.ItemCode
                  INNER JOIN target t ON t.DispOrderHeaderId = dol2.DispOrderHeaderId
                  WHERE ISNULL(i2.ProductHierarchyLevel02, N'') != N'') dol
            GROUP BY dol.DispOrderHeaderId
        ),
        aggBrand AS (
            SELECT dol.DispOrderHeaderId,
                   Brand = STRING_AGG(dol.ph01, N',') WITHIN GROUP (ORDER BY dol.ph01)
            FROM (SELECT DISTINCT dol2.DispOrderHeaderId, ISNULL(i2.ProductHierarchyLevel01, N'') AS ph01
                  FROM dbo.DispOrderLine dol2 WITH (NOLOCK)
                  INNER JOIN ext.Item i2 WITH (NOLOCK) ON i2.Company = dol2.Company AND i2.ItemCode = dol2.ItemCode
                  INNER JOIN target t ON t.DispOrderHeaderId = dol2.DispOrderHeaderId
                  WHERE ISNULL(i2.ProductHierarchyLevel01, N'') != N'') dol
            GROUP BY dol.DispOrderHeaderId
        )
        UPDATE doh SET doh.Category = ISNULL(c.Category, doh.Category), doh.Brand = ISNULL(b.Brand, doh.Brand)
        FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
        INNER JOIN target t ON t.DispOrderHeaderId = doh.DispOrderHeaderId
        LEFT JOIN aggCategory c ON c.DispOrderHeaderId = doh.DispOrderHeaderId
        LEFT JOIN aggBrand b ON b.DispOrderHeaderId = doh.DispOrderHeaderId
        WHERE c.DispOrderHeaderId IS NOT NULL OR b.DispOrderHeaderId IS NOT NULL;
    END
END
GO

PRINT 'dbo.UpdateDispOrderHeaderCategorySeason oluşturuldu (set-based).';
GO
