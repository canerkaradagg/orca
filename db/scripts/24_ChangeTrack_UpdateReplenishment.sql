-- ============================================================
-- ORCA – ChangeTrack + UpdateReplenishment (Union mantığı)
-- Bloklamayı azaltmak için: batch, kısa transaction, ROWLOCK, MERGE yerine INSERT+UPDATE
-- ÖNCE: 24a_EnableChangeTracking_ERP.sql her ERP veritabanında çalıştırılmalı
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== ChangeTrack tablosu ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ChangeTrack' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.ChangeTrack (
    ChangeTrackId   INT           IDENTITY(1,1) NOT NULL,
    Company         NVARCHAR(10)  NULL,
    LastChangeId    BIGINT        NULL,
    Type            NVARCHAR(50)  NULL,
    LastTimestamp   DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_ChangeTrack PRIMARY KEY CLUSTERED (ChangeTrackId)
);
GO

-- UpdateReplenishment için seed (OLKA, MARLIN, JUPITER, NEPTUN, SATURN)
IF NOT EXISTS (SELECT 1 FROM dbo.ChangeTrack WHERE Type = N'UpdateReplenishment')
INSERT INTO dbo.ChangeTrack (Company, LastChangeId, Type)
SELECT Company, 0, N'UpdateReplenishment'
  FROM (VALUES (N'OLKA'), (N'MARLIN'), (N'JUPITER'), (N'NEPTUN'), (N'SATURN')) t(Company);
GO

-- ==================== UpdateReplenishment ====================
-- Union ile tam uyum: Barcode doldurma, duplicate temizlik, ChangeTrack senkron, UpdateDispOrderLinePrice.
-- Union'daki UpdateCustomerMarkup/UpdatePriceList ORCA'da yok (fiyat ext.OrderLinePrice üzerinden).
CREATE OR ALTER PROCEDURE dbo.UpdateReplenishment
    @BatchSize      INT = 500,
    @WaitMs         INT = 50,
    @MaxBatches     INT = 100,
    @BarcodeDays    INT = 3   -- Son kaç günün DispOrderLine.Barcode'u doldurulur (0 = atla)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Company NVARCHAR(10), @LastChangeId BIGINT, @ChangeTrackId INT;
    DECLARE @BatchNum INT = 0, @HeaderIns INT, @HeaderUpd INT, @LineIns INT, @LineUpd INT;
    DECLARE @NewLastId BIGINT;
    DECLARE @Day INT = @BarcodeDays;

    -- ----- 1) Barcode doldurma (Union: son @Day gün, DispOrderLine.Barcode IS NULL, ext.ItemBarcode EAN13) -----
    IF @Day > 0 AND OBJECT_ID('ext.ItemBarcode', 'V') IS NOT NULL
    BEGIN
        BEGIN TRY
            ;WITH BarcodeList AS (
                SELECT DISTINCT doh.Company, dol.ItemCode, dol.ColorCode, dol.ItemDim1Code, dol.ItemDim2Code, ib.Barcode
                  FROM dbo.DispOrderHeader doh WITH (NOLOCK)
                  INNER JOIN dbo.DispOrderLine dol WITH (NOLOCK) ON dol.DispOrderHeaderId = doh.DispOrderHeaderId AND dol.Company = doh.Company
                  INNER JOIN ext.ItemBarcode ib WITH (NOLOCK)
                    ON ib.Company = doh.Company AND ib.ItemCode = dol.ItemCode AND ib.ColorCode = dol.ColorCode
                   AND ISNULL(ib.ItemDim1Code, N'') = ISNULL(dol.ItemDim1Code, N'') AND ISNULL(ib.ItemDim2Code, N'') = ISNULL(dol.ItemDim2Code, N'')
                 WHERE doh.CreatedDate > DATEADD(DAY, -@Day, GETDATE())
                   AND dol.Barcode IS NULL
            ),
            BlRank AS ( SELECT Company, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Barcode,
                        ROW_NUMBER() OVER (PARTITION BY Company, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code ORDER BY Barcode) AS rn FROM BarcodeList )
            UPDATE dol SET dol.Barcode = bl.Barcode
              FROM dbo.DispOrderLine dol WITH (ROWLOCK)
              INNER JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.DispOrderHeaderId = dol.DispOrderHeaderId AND doh.Company = dol.Company
              INNER JOIN BlRank bl ON bl.Company = dol.Company AND bl.ItemCode = dol.ItemCode AND bl.ColorCode = dol.ColorCode
                 AND ISNULL(bl.ItemDim1Code, N'') = ISNULL(dol.ItemDim1Code, N'') AND ISNULL(bl.ItemDim2Code, N'') = ISNULL(dol.ItemDim2Code, N'') AND bl.rn = 1
             WHERE dol.Barcode IS NULL AND doh.CreatedDate > DATEADD(DAY, -@Day, GETDATE());
        END TRY
        BEGIN CATCH
            DECLARE @BarcodeErr NVARCHAR(MAX) = ERROR_MESSAGE();
            IF OBJECT_ID('dbo.SaveErrorLog', 'P') IS NOT NULL
                EXEC dbo.SaveErrorLog @ErrorMessage = @BarcodeErr, @ErrorSource = N'UpdateReplenishment Barcode', @RaiseError = 0;
        END CATCH
    END

    -- ----- 2) Duplicate temizlik (Union: aynı Company+SourceDispOrderHeaderId birden fazla ise birini tut, diğerlerini sil) -----
    BEGIN TRY
        ;WITH dup AS (
            SELECT Company, SourceDispOrderHeaderId
              FROM dbo.DispOrderHeader WITH (NOLOCK)
             GROUP BY Company, SourceDispOrderHeaderId
            HAVING COUNT(*) > 1
        ),
        sel AS (
            SELECT DispOrderHeaderId, AsnNo, ROW_NUMBER() OVER (ORDER BY CASE WHEN AsnNo IS NULL THEN 0 ELSE 1 END) AS rn
              FROM dbo.DispOrderHeader doh WITH (NOLOCK)
             WHERE EXISTS (SELECT 1 FROM dup d WHERE d.Company = doh.Company AND d.SourceDispOrderHeaderId = doh.SourceDispOrderHeaderId)
        )
        DELETE doh
          FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
         WHERE EXISTS (SELECT 1 FROM sel s WHERE s.DispOrderHeaderId = doh.DispOrderHeaderId AND s.rn <> 1);

        DELETE dol
          FROM dbo.DispOrderLine dol WITH (ROWLOCK)
         WHERE NOT EXISTS (SELECT 1 FROM dbo.DispOrderHeader doh WITH (NOLOCK) WHERE doh.DispOrderHeaderId = dol.DispOrderHeaderId);
    END TRY
    BEGIN CATCH
        DECLARE @DupErr NVARCHAR(MAX) = ERROR_MESSAGE();
        IF OBJECT_ID('dbo.SaveErrorLog', 'P') IS NOT NULL
            EXEC dbo.SaveErrorLog @ErrorMessage = @DupErr, @ErrorSource = N'UpdateReplenishment Duplicate', @RaiseError = 0;
    END CATCH

    -- ----- 3) ChangeTrack senkron (ERP -> dbo.DispOrderHeader/Line) -----
    -- Şirket listesi (CURSOR yerine tablo değişkeni)
    DECLARE @Companies TABLE (Company NVARCHAR(10), ChangeTrackId INT, LastChangeId BIGINT, rn INT);
    INSERT INTO @Companies (Company, ChangeTrackId, LastChangeId, rn)
    SELECT ct.Company, ct.ChangeTrackId, ISNULL(ct.LastChangeId, 0), ROW_NUMBER() OVER (ORDER BY ct.Company)
      FROM dbo.ChangeTrack ct WITH (NOLOCK)
     WHERE ct.Type = N'UpdateReplenishment';

    DECLARE @c NVARCHAR(10), @ctId INT, @lastId BIGINT, @rn INT = 1;
    DECLARE @maxRn INT = (SELECT MAX(rn) FROM @Companies);

    WHILE @rn <= @maxRn
    BEGIN
        SELECT @c = Company, @ctId = ChangeTrackId, @lastId = LastChangeId
          FROM @Companies WHERE rn = @rn;

        -- Bu şirket için batch döngüsü
        SET @BatchNum = 0;
        WHILE @BatchNum < @MaxBatches
        BEGIN
            SET @BatchNum = @BatchNum + 1;

            -- #BatchHeader: Bu batch'teki değişen header ID'leri
            IF OBJECT_ID('tempdb..#BatchHeader') IS NOT NULL DROP TABLE #BatchHeader;
            CREATE TABLE #BatchHeader (DispOrderHeaderId UNIQUEIDENTIFIER, ChangeVersionId BIGINT, Operation NVARCHAR(1));

            -- CHANGETABLE'dan TOP N al (hangi DB şirkete göre)
            IF @c = N'OLKA'
                INSERT INTO #BatchHeader (DispOrderHeaderId, ChangeVersionId, Operation)
                SELECT TOP (@BatchSize) ct.DispOrderHeaderId, ct.SYS_CHANGE_VERSION, ct.SYS_CHANGE_OPERATION
                  FROM CHANGETABLE(CHANGES OlkaV3.dbo.trDispOrderHeader, @lastId) ct;
            ELSE IF @c = N'MARLIN'
                INSERT INTO #BatchHeader (DispOrderHeaderId, ChangeVersionId, Operation)
                SELECT TOP (@BatchSize) ct.DispOrderHeaderId, ct.SYS_CHANGE_VERSION, ct.SYS_CHANGE_OPERATION
                  FROM CHANGETABLE(CHANGES MARLINV3.dbo.trDispOrderHeader, @lastId) ct;
            ELSE IF @c = N'JUPITER'
                INSERT INTO #BatchHeader (DispOrderHeaderId, ChangeVersionId, Operation)
                SELECT TOP (@BatchSize) ct.DispOrderHeaderId, ct.SYS_CHANGE_VERSION, ct.SYS_CHANGE_OPERATION
                  FROM CHANGETABLE(CHANGES JUPITERV3.dbo.trDispOrderHeader, @lastId) ct;
            ELSE IF @c = N'NEPTUN'
                INSERT INTO #BatchHeader (DispOrderHeaderId, ChangeVersionId, Operation)
                SELECT TOP (@BatchSize) ct.DispOrderHeaderId, ct.SYS_CHANGE_VERSION, ct.SYS_CHANGE_OPERATION
                  FROM CHANGETABLE(CHANGES NEPTUNV3.dbo.trDispOrderHeader, @lastId) ct;
            ELSE IF @c = N'SATURN'
                INSERT INTO #BatchHeader (DispOrderHeaderId, ChangeVersionId, Operation)
                SELECT TOP (@BatchSize) ct.DispOrderHeaderId, ct.SYS_CHANGE_VERSION, ct.SYS_CHANGE_OPERATION
                  FROM CHANGETABLE(CHANGES SaturnV3.dbo.trDispOrderHeader, @lastId) ct;

            IF @@ROWCOUNT = 0 BREAK;

            SET @NewLastId = (SELECT MAX(ChangeVersionId) FROM #BatchHeader);

            -- Sadece I, U, L (insert/update) işlemleri
            DELETE FROM #BatchHeader WHERE Operation NOT IN (N'I', N'U', N'L');

            IF NOT EXISTS (SELECT 1 FROM #BatchHeader) 
            BEGIN
                UPDATE dbo.ChangeTrack WITH (ROWLOCK) SET LastChangeId = @NewLastId, LastTimestamp = GETDATE() WHERE ChangeTrackId = @ctId;
                DROP TABLE #BatchHeader;
                BREAK;
            END

            BEGIN TRANSACTION;

            BEGIN TRY
                -- INSERT yeni header'lar (ext'ten, dbo'da yoksa). AsnNo/RequestId DraftOrderHeader->Request'ten.
                INSERT INTO dbo.DispOrderHeader WITH (ROWLOCK)
                    (Company, SourceDispOrderHeaderId, RequestId, AsnNo, DispOrderNumber, DispOrderDate, ProcessCode, CurrAccTypeCode, CurrAccCode,
                     SubCurrAccId, WarehouseCode, DispOrderStatusId, IsCollected, Valid, Type, FinancialApproval, SingleWaybill, ShipmentApproval)
                SELECT ext.Company, ext.DispOrderHeaderId, dh.RequestId, r.AsnNo, ext.DispOrderNumber, ext.DispOrderDate, ext.ProcessCode, ext.CurrAccTypeCode, ext.CurrAccCode,
                       ext.SubCurrAccId, ext.WarehouseCode, 0, 0, 1, CAST(NULL AS NVARCHAR(30)), ISNULL(c.FinancialApproval, 0), ISNULL(c.SingleWaybill, 0), ISNULL(c.ShipmentApproval, 0)
                  FROM ext.DispOrderHeader ext WITH (NOLOCK)
                  JOIN #BatchHeader bh ON bh.DispOrderHeaderId = ext.DispOrderHeaderId
                  LEFT JOIN dbo.cdWarehouse wc ON wc.Company = ext.Company AND wc.WarehouseCode = ext.WarehouseCode
                  LEFT JOIN ext.Customer c ON c.Company = ext.Company AND c.CurrAccTypeCode = ext.CurrAccTypeCode AND c.CurrAccCode = ext.CurrAccCode
                  LEFT JOIN dbo.DraftOrderHeader dh ON dh.DispOrderHeaderId = ext.DispOrderHeaderId
                  LEFT JOIN dbo.Request r ON r.RequestId = dh.RequestId
                 WHERE ext.Company = @c
                   AND ext.IsReturn != 1
                   AND (wc.IsBlocked = 0 OR NOT EXISTS (SELECT 1 FROM dbo.cdWarehouse w2 WITH (NOLOCK) WHERE w2.Company = @c))
                   AND NOT EXISTS (SELECT 1 FROM dbo.DispOrderHeader doh WITH (NOLOCK) WHERE doh.SourceDispOrderHeaderId = ext.DispOrderHeaderId);

                SET @HeaderIns = @@ROWCOUNT;

                -- UPDATE mevcut header'lar (AsnNo/RequestId DraftOrderHeader->Request'ten, yoksa dokunma)
                UPDATE doh WITH (ROWLOCK) SET
                    doh.DispOrderNumber = ext.DispOrderNumber,
                    doh.DispOrderDate   = ext.DispOrderDate,
                    doh.ProcessCode    = ext.ProcessCode,
                    doh.CurrAccTypeCode= ext.CurrAccTypeCode,
                    doh.CurrAccCode    = ext.CurrAccCode,
                    doh.SubCurrAccId   = ext.SubCurrAccId,
                    doh.WarehouseCode   = ext.WarehouseCode,
                    doh.Valid          = 1,
                    doh.RequestId      = CASE WHEN r.RequestId IS NOT NULL THEN r.RequestId ELSE doh.RequestId END,
                    doh.AsnNo          = CASE WHEN r.AsnNo IS NOT NULL THEN r.AsnNo ELSE doh.AsnNo END
                  FROM dbo.DispOrderHeader doh WITH (ROWLOCK)
                  JOIN ext.DispOrderHeader ext WITH (NOLOCK) ON ext.Company = doh.Company AND ext.DispOrderHeaderId = doh.SourceDispOrderHeaderId
                  JOIN #BatchHeader bh ON bh.DispOrderHeaderId = doh.SourceDispOrderHeaderId
                  LEFT JOIN dbo.DraftOrderHeader dh ON dh.DispOrderHeaderId = ext.DispOrderHeaderId
                  LEFT JOIN dbo.Request r ON r.RequestId = dh.RequestId
                 WHERE doh.SourceDispOrderHeaderId IS NOT NULL;

                SET @HeaderUpd = @@ROWCOUNT;

                -- Line: INSERT (yeni header'ların line'ları - header bu batch'te insert edildiyse)
                INSERT INTO dbo.DispOrderLine WITH (ROWLOCK) (DispOrderHeaderId, Company, SourceDispOrderLineId, ItemCode, ColorCode, ItemDim1Code, ItemDim2Code, Qty1, OrderLineId, ITAtt02, Valid)
                SELECT doh.DispOrderHeaderId, ext.Company, ext.DispOrderLineId, ext.ItemCode, ext.ColorCode, ext.ItemDim1Code, ext.ItemDim2Code,
                       ISNULL(ext.Qty1, 0), ext.OrderLineId, ext.ITAtt02, 1
                  FROM ext.DispOrderLine ext WITH (NOLOCK)
                  JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.Company = ext.Company AND doh.SourceDispOrderHeaderId = ext.DispOrderHeaderId
                  JOIN #BatchHeader bh ON bh.DispOrderHeaderId = ext.DispOrderHeaderId
                 WHERE ext.Company = @c
                   AND NOT EXISTS (SELECT 1 FROM dbo.DispOrderLine dol WITH (NOLOCK) WHERE dol.SourceDispOrderLineId = ext.DispOrderLineId);

                SET @LineIns = @@ROWCOUNT;

                -- Line: UPDATE mevcut
                UPDATE dol WITH (ROWLOCK) SET dol.Qty1 = ext.Qty1, dol.ITAtt02 = ext.ITAtt02, dol.OrderLineId = ext.OrderLineId,
                       dol.ItemCode = ext.ItemCode, dol.ColorCode = ext.ColorCode, dol.ItemDim1Code = ext.ItemDim1Code, dol.ItemDim2Code = ext.ItemDim2Code
                  FROM dbo.DispOrderLine dol WITH (ROWLOCK)
                  JOIN dbo.DispOrderHeader doh WITH (NOLOCK) ON doh.DispOrderHeaderId = dol.DispOrderHeaderId
                  JOIN ext.DispOrderLine ext WITH (NOLOCK) ON ext.Company = dol.Company AND ext.DispOrderHeaderId = doh.SourceDispOrderHeaderId AND ext.DispOrderLineId = dol.SourceDispOrderLineId
                  JOIN #BatchHeader bh ON bh.DispOrderHeaderId = doh.SourceDispOrderHeaderId
                 WHERE dol.SourceDispOrderLineId IS NOT NULL;

                SET @LineUpd = @@ROWCOUNT;

                UPDATE dbo.ChangeTrack WITH (ROWLOCK) SET LastChangeId = @NewLastId, LastTimestamp = GETDATE() WHERE ChangeTrackId = @ctId;

                COMMIT TRANSACTION;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
                RAISERROR(N'UpdateReplenishment hata [%s]: %s', 16, 1, @c, @Err);
                RETURN;
            END CATCH

            DROP TABLE #BatchHeader;

            IF @WaitMs > 0
                WAITFOR DELAY '00:00:00.050';
        END

        SET @rn = @rn + 1;
    END

    EXEC dbo.UpdateDispOrderLinePrice;
    PRINT 'UpdateReplenishment tamamlandı.';
END
GO

PRINT 'ChangeTrack, UpdateReplenishment oluşturuldu.';
GO
