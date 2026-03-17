-- ============================================================
-- ORCA ASN Portalı – dbo.Allocation
-- @RequestId ile tek Request aloke eder.
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- ============================================================

USE [OrcaAlokasyon]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.Allocation
    @RequestId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Company                NVARCHAR(10)
    DECLARE @ReferenceId            INT
    DECLARE @IsReturn               BIT
    DECLARE @AsnNo                  NVARCHAR(30)
    DECLARE @VendorCode             NVARCHAR(30)
    DECLARE @PurchaseOrderNo        NVARCHAR(50)
    DECLARE @ITAtt03                NVARCHAR(50)
    DECLARE @ITAtt05                NVARCHAR(50)
    DECLARE @ItemCode               NVARCHAR(30)
    DECLARE @ColorCode              NVARCHAR(10)
    DECLARE @StatusId               INT
    DECLARE @Exception              BIT
    DECLARE @InboundAsnId           INT
    DECLARE @CheckNextOrder         BIT

    DECLARE @ChannelTemplateCode    NVARCHAR(10)
    DECLARE @WarehouseCode          NVARCHAR(10)

    DECLARE @CurrAccTypeCode        TINYINT
    DECLARE @CurrAccCode            NVARCHAR(30)
    DECLARE @SubCurrAccId           UNIQUEIDENTIFIER
    DECLARE @SubCurrAccCode         NVARCHAR(20)
    DECLARE @CustomerCompleted      BIT
    DECLARE @ProcessCode            NVARCHAR(5)
    DECLARE @TemplateException      BIT

    DECLARE @LotCode                NVARCHAR(10)
    DECLARE @LotElement             INT
    DECLARE @OrderElement           INT
    DECLARE @OrderSum               INT
    DECLARE @LotSum                 INT
    DECLARE @LotCount               INT
    DECLARE @AvailableLotQuantity   INT

    DECLARE @DraftOrderHeaderId     INT

    DECLARE @OrderHeaderId          UNIQUEIDENTIFIER
    DECLARE @OrderLineId            UNIQUEIDENTIFIER

    DECLARE @ReceivedOrderId        INT
    DECLARE @ReferenceOrderId       INT
    DECLARE @ReceivedQuantity       INT
    DECLARE @OpenQuantity           INT
    DECLARE @AllocationQuantity     INT
    DECLARE @PoolQuantity           INT
    DECLARE @RunningQuantity        INT
    DECLARE @ItemDim1Code           NVARCHAR(10)
    DECLARE @ItemDim2Code           NVARCHAR(10)

    DECLARE @Less                   INT
    DECLARE @CurrentQuantity        INT

    DECLARE @IsWT                   BIT
    DECLARE @OrderCount             INT

    DECLARE @DraftOrderHeader       TABLE
    (
        DraftOrderHeaderId  INT
       ,OrderHeaderId       UNIQUEIDENTIFIER
       ,IsPool              BIT
    )

    DECLARE @ReferenceOrder         TABLE
    (
        ItemDim1Code    NVARCHAR(10)
       ,ItemDim2Code    NVARCHAR(10)
       ,PoolQuantity    INT
    )

    DECLARE @trOrderLine            TABLE
    (
        OrderLineId             UNIQUEIDENTIFIER
       ,CancelQty1              FLOAT
       ,CancelDate              SMALLDATETIME
       ,OrderCancelReasonCode   NVARCHAR(5)
       ,LastUpdatedUserName     NVARCHAR(20)
       ,LastUpdatedDate         DATETIME
    )

    SELECT @Company             = r.Company
          ,@ReferenceId         = r.ReferenceId
          ,@IsReturn            = r.IsReturn
          ,@AsnNo               = r.AsnNo
          ,@PurchaseOrderNo     = r.PurchaseOrderNo
          ,@ITAtt03             = r.ITAtt03
          ,@ItemCode            = r.ItemCode
          ,@ColorCode           = r.ColorCode
          ,@StatusId            = r.StatusId
          ,@ChannelTemplateCode = ia.ChannelTemplateCode
          ,@WarehouseCode       = ia.WarehouseCode
          ,@Exception           = r.Exception
          ,@InboundAsnId        = r.InboundAsnId
          ,@VendorCode          = ia.VendorCode
          ,@CheckNextOrder      = IIF(ev.CurrAccCode IS NULL, 1, 0)
      FROM dbo.Request r
      JOIN dbo.InboundAsn ia ON ia.InboundAsnId = r.InboundAsnId
      LEFT JOIN dbo.AllocationExceptionVendor ev ON ev.Company = r.Company
                                                 AND ev.CurrAccCode = ia.VendorCode
     WHERE r.RequestId = @RequestId

    IF @Company IS NULL RETURN;

    IF @Exception = 1
    BEGIN
        IF NOT EXISTS (SELECT NULL FROM dbo.Request
                        WHERE RequestId = @ReferenceId
                          AND CompletedDate IS NOT NULL)
        BEGIN
            RETURN
        END

        IF NOT EXISTS (SELECT NULL FROM dbo.InboundAsn ia
                        WHERE ia.IsCollected = 1
                          AND ia.InboundAsnId = @InboundAsnId)
        BEGIN
            RETURN
        END

        DELETE FROM dbo.ReceivedOrder
         WHERE RequestId = @RequestId

        INSERT INTO dbo.ReceivedOrder
        (
            RequestId
           ,LotCode
           ,ItemDim1Code
           ,ItemDim2Code
           ,Quantity
           ,LotQuantity
           ,OriginalQuantity
        )
        SELECT @RequestId
              ,LotCode          = NULL
              ,iac.ItemDim1Code
              ,iac.ItemDim2Code
              ,Quantity          = iac.Quantity - ISNULL(r.AllocationQuantity, 0)
              ,LotQuantity       = NULL
              ,Quantity          = iac.Quantity - ISNULL(r.AllocationQuantity, 0)
          FROM dbo.InboundAsnCollected iac
               OUTER APPLY (SELECT AllocationQuantity = SUM(AllocationQuantity)
                              FROM dbo.ReceivedOrder ro
                             WHERE RequestId = @ReferenceId
                               AND ItemDim1Code = iac.ItemDim1Code
                               AND ItemDim2Code = iac.ItemDim2Code
                               AND AllocationQuantity > 0) r
         WHERE iac.InboundAsnId = @InboundAsnId
           AND ISNULL(iac.PurchaseOrderNo, '') = ISNULL(@PurchaseOrderNo, '')
           AND ISNULL(iac.ITAtt03, '') = ISNULL(@ITAtt03, '')
           AND iac.ItemCode = @ItemCode
           AND iac.ColorCode = @ColorCode
           AND iac.Quantity - ISNULL(r.AllocationQuantity, 0) > 0
    END

    IF ISNULL(@Exception,0) = 0 AND EXISTS (SELECT NULL FROM dbo.Request r
                                             WHERE r.Company = @Company
                                               AND ISNULL(r.PurchaseOrderNo,'') = ISNULL(@PurchaseOrderNo,'')
                                               AND ISNULL(r.ITAtt03,'') = ISNULL(@ITAtt03,'')
                                               AND r.ItemCode = @ItemCode
                                               AND r.ColorCode = @ColorCode
                                               AND r.CompletedDate IS NULL
                                               AND r.RequestId < @RequestId
                                               AND r.Exception = 0)
    BEGIN
        RETURN
    END

    IF ISNULL(@Exception,0) = 1 AND EXISTS (SELECT NULL FROM dbo.Request r
                                             WHERE r.Company = @Company
                                               AND ISNULL(r.PurchaseOrderNo,'') = ISNULL(@PurchaseOrderNo,'')
                                               AND ISNULL(r.ITAtt03,'') = ISNULL(@ITAtt03,'')
                                               AND r.ItemCode = @ItemCode
                                               AND r.ColorCode = @ColorCode
                                               AND r.CompletedDate IS NULL
                                               AND r.AllocatedDate IS NOT NULL
                                               AND r.RequestId < @RequestId
                                               AND r.Exception = 1)
    BEGIN
        RETURN
    END

    IF EXISTS (SELECT NULL FROM dbo.DraftOrderHeader WHERE RequestId = @RequestId)
    BEGIN
        EXEC dbo.SaveErrorLog
            @ErrorMessage = N'Allocation: DraftOrderHeader zaten mevcut, tekrar çalışmıyor.',
            @ErrorSource  = N'dbo.Allocation',
            @RaiseError   = 0;
        RETURN
    END

    BEGIN TRY
        IF OBJECT_ID('tempdb..#ChannelTemplate') IS NOT NULL
            DROP TABLE #ChannelTemplate

        CREATE TABLE #ChannelTemplate
        (
            CurrAccTypeCode TINYINT
           ,CurrAccCode     NVARCHAR(60)
           ,SubCurrAccId    UNIQUEIDENTIFIER
           ,SubCurrAccCode  NVARCHAR(40)
           ,SortOrder       INT
           ,Priority        INT
           ,Exception       BIT
        )

        EXEC dbo.UpdateChannelTemplate
    END TRY
    BEGIN CATCH
        DECLARE @PrepErr NVARCHAR(MAX) = ERROR_MESSAGE();
        EXEC dbo.SaveErrorLog
            @ErrorMessage = @PrepErr,
            @ErrorSource  = N'dbo.Allocation Prepare',
            @RaiseError   = 0;
        RETURN
    END CATCH

    IF NOT EXISTS (SELECT NULL FROM dbo.ReceivedOrder WHERE RequestId = @RequestId AND Quantity > 0)
    BEGIN
        IF @Exception = 1
        BEGIN
            UPDATE dbo.Request
               SET StatusId         = 2
                  ,Explanation      = N'WT Süreci için dağıtılacak ürün kalmadı'
                  ,AllocatedDate    = GETDATE()
                  ,CompletedDate    = GETDATE()
             WHERE RequestId = @RequestId
        END
        ELSE
        BEGIN
            UPDATE dbo.Request
               SET StatusId         = 3
                  ,Explanation      = N'Verilen sipariş yok'
                  ,AllocatedDate    = GETDATE()
             WHERE RequestId = @RequestId
        END
        RETURN
    END

    BEGIN TRAN

    BEGIN TRY
        DELETE FROM dbo.ReferenceOrder
         WHERE RequestId = @RequestId

        UPDATE ro SET ro.AllocationQuantity = NULL
                     ,ro.AllocationLotQuantity = NULL
                     ,ro.UnpackQuantity = NULL
                     ,ro.UnpackLotQuantity = NULL
          FROM dbo.ReceivedOrder ro
         WHERE RequestId = @RequestId

        INSERT INTO dbo.ReferenceOrder
        (
            RequestId, OrderLineId, OrderHeaderId, ProcessCode, OrderNumber
           ,CurrAccTypeCode, CurrAccCode, SubCurrAccId, SubCurrAccCode
           ,PurchaseOrderNo, LotCode, ItemDim1Code, ItemDim2Code
           ,OrderQuantity, OpenQuantity, OriginalOpenQuantity, CancelQuantity
           ,Description, DocCurrencyCode, OfficeCode, PaymentTerm
           ,ShipmentMethodCode, PaymentMethodCode, IncotermCode1
           ,ATAtt01, ATAtt02, ITAtt01, ITAtt02, ITAtt03, ITAtt04, ITAtt05
           ,ShippingPostalAddressId, BillingPostalAddressId
        )
        SELECT @RequestId
              ,ol.OrderLineId, oh.OrderHeaderId, oh.ProcessCode, oh.OrderNumber
              ,oh.CurrAccTypeCode, oh.CurrAccCode, oh.SubCurrAccId, sc.SubCurrAccCode
              ,ol.PurchaseOrderNo, ol.LotCode, ol.ItemDim1Code, ol.ItemDim2Code
              ,ol.OrderQuantity, ol.OpenQuantity, ol.OpenQuantity, ol.CancelQuantity
              ,oh.Description, oh.DocCurrencyCode, oh.OfficeCode, oh.PaymentTerm
              ,oh.ShipmentMethodCode, oh.PaymentMethodCode, oh.IncotermCode1
              ,oh.ATAtt01, oh.ATAtt02, ol.ITAtt01, ol.ITAtt02, ol.ITAtt03, ol.ITAtt04, ol.ITAtt05
              ,oh.ShippingPostalAddressId, oh.BillingPostalAddressId
          FROM ext.OrderHeader oh
          JOIN ext.OrderLine ol ON ol.Company = oh.Company AND ol.OrderHeaderId = oh.OrderHeaderId
          LEFT JOIN ext.SubCustomer sc ON sc.Company = oh.Company AND sc.SubCurrAccId = oh.SubCurrAccId
         WHERE oh.Company = @Company
           AND ISNULL(ol.PurchaseOrderNo,'') = ISNULL(@PurchaseOrderNo,'')
           AND ISNULL(ol.ITAtt03,'') = ISNULL(@ITAtt03,'')
           AND ol.ItemTypeCode = 1
           AND ol.ItemCode = @ItemCode
           AND ol.ColorCode = @ColorCode
           AND ol.OpenQuantity > 0
           AND oh.CurrAccTypeCode IN (3,5)
           AND oh.WarehouseCode = @WarehouseCode
           AND (@Exception = 0 OR EXISTS (SELECT NULL FROM dbo.ExceptionStoreList esl
                                           WHERE esl.CurrAccTypeCode = oh.CurrAccTypeCode
                                             AND esl.CurrAccCode = oh.CurrAccCode))

        INSERT INTO #ChannelTemplate (CurrAccTypeCode, CurrAccCode, SubCurrAccId, SubCurrAccCode, SortOrder, Priority, Exception)
        SELECT ctc.CurrAccTypeCode, ctc.CurrAccCode, ctc.SubCurrAccId, ctc.SubCurrAccCode
              ,ctc.SortOrder, Priority = 1
              ,Exception = CAST(IIF(esl.CurrAccCode IS NOT NULL,1,0) AS BIT)
          FROM dbo.cdChannelTemplate ct
          JOIN dbo.cdChannelTemplateCustomer ctc ON ctc.Company = ct.Company AND ctc.ChannelTemplateCode = ct.ChannelTemplateCode
          LEFT JOIN dbo.ExceptionStoreList esl ON esl.CurrAccTypeCode = ctc.CurrAccTypeCode AND esl.CurrAccCode = ctc.CurrAccCode
         WHERE ct.Company = @Company
           AND ct.ChannelTemplateCode = @ChannelTemplateCode
           AND ct.IsBlocked = 0
           AND EXISTS (SELECT NULL FROM dbo.ReferenceOrder ro
                        WHERE ro.CurrAccTypeCode = ctc.CurrAccTypeCode AND ro.CurrAccCode = ctc.CurrAccCode
                          AND ISNULL(ro.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER)) = ISNULL(ctc.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER))
                          AND ro.RequestId = @RequestId)

        INSERT INTO #ChannelTemplate (CurrAccTypeCode, CurrAccCode, SubCurrAccId, SubCurrAccCode, SortOrder, Priority, Exception)
        SELECT ro.CurrAccTypeCode, ro.CurrAccCode, ro.SubCurrAccId, ro.SubCurrAccCode
              ,SortOrder = 0, Priority = 2
              ,Exception = CAST(IIF(esl.CurrAccCode IS NOT NULL,1,0) AS BIT)
          FROM dbo.ReferenceOrder ro
          LEFT JOIN dbo.ExceptionStoreList esl ON esl.CurrAccTypeCode = ro.CurrAccTypeCode AND esl.CurrAccCode = ro.CurrAccCode
         WHERE RequestId = @RequestId
           AND NOT EXISTS (SELECT NULL FROM #ChannelTemplate ct
                            WHERE ct.CurrAccTypeCode = ro.CurrAccTypeCode AND ct.CurrAccCode = ro.CurrAccCode
                              AND ISNULL(ct.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER)) = ISNULL(ro.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER)))
         GROUP BY ro.CurrAccTypeCode, ro.CurrAccCode, ro.SubCurrAccId, ro.SubCurrAccCode
                 ,CAST(IIF(esl.CurrAccCode IS NOT NULL,1,0) AS BIT)
    END TRY
    BEGIN CATCH
        ROLLBACK
        DECLARE @PrepErr2 NVARCHAR(MAX) = ERROR_MESSAGE();
        EXEC dbo.SaveErrorLog @ErrorMessage = @PrepErr2, @ErrorSource = N'dbo.Allocation Prepare', @RaiseError = 0;
        RETURN
    END CATCH

    IF OBJECT_ID('tempdb..#OpenOrder') IS NOT NULL
        DROP TABLE #OpenOrder

    SELECT ItemDim1Code, ItemDim2Code
          ,ITAtt05          = ISNULL(ITAtt05,'')
          ,OpenQuantity     = SUM(OpenQuantity)
          ,ReceivedQuantity = 0
          ,NextOrder        = 0
          ,Less             = 0
          ,OtherQuantity    = 0
      INTO #OpenOrder
      FROM dbo.ReferenceOrder ro
     WHERE RequestId = @RequestId
       AND ((@Exception = 0 AND NOT EXISTS (SELECT 1 FROM dbo.ExceptionStoreList esl
                                             WHERE esl.CurrAccTypeCode = ro.CurrAccTypeCode AND esl.CurrAccCode = ro.CurrAccCode))
            OR (@Exception = 1 AND EXISTS (SELECT 1 FROM dbo.ExceptionStoreList esl
                                             WHERE esl.CurrAccTypeCode = ro.CurrAccTypeCode AND esl.CurrAccCode = ro.CurrAccCode)))
     GROUP BY ItemDim1Code, ItemDim2Code, ISNULL(ITAtt05,'')

    IF @Exception = 0
    BEGIN
        IF EXISTS (SELECT NULL
                     FROM dbo.Request r
                     JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = r.InboundAsnId
                                                 AND ial.PurchaseOrderNo = r.PurchaseOrderNo
                                                 AND ial.ProductCode = r.ItemCode
                                                 AND ial.ColorCode = r.ColorCode
                                                 AND ISNULL(ial.ITAtt03,'') = ISNULL(r.ITAtt03,'')
                    WHERE r.RequestId = @RequestId
                      AND ISNULL(ial.CaseCode,'') != '')
        BEGIN
            IF OBJECT_ID('tempdb..#AsnDetail') IS NOT NULL DROP TABLE #AsnDetail
            IF OBJECT_ID('tempdb..#CaseStatus') IS NOT NULL DROP TABLE #CaseStatus

            SELECT ial.CaseCode, ial.ItemDim1Code, ial.ItemDim2Code, ial.EanCode, ial.Quantity
              INTO #AsnDetail
              FROM dbo.Request r
              JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = r.InboundAsnId
                                          AND ial.PurchaseOrderNo = r.PurchaseOrderNo
                                          AND ial.ProductCode = r.ItemCode
                                          AND ial.ColorCode = r.ColorCode
                                          AND ISNULL(ial.ITAtt03,'') = ISNULL(r.ITAtt03,'')
             WHERE r.RequestId = @RequestId

            SELECT CaseCode, SizeCount = COUNT(DISTINCT EanCode)
              INTO #CaseStatus
              FROM #AsnDetail
             GROUP BY CaseCode

            UPDATE oo SET oo.ReceivedQuantity = ISNULL(r.Quantity,0)
              FROM #OpenOrder oo
              OUTER APPLY (SELECT Quantity = SUM(Quantity) FROM #AsnDetail ad
                            WHERE ad.ItemDim1Code = oo.ItemDim1Code AND ad.ItemDim2Code = oo.ItemDim2Code                              AND EXISTS (SELECT NULL FROM #CaseStatus cs WHERE cs.CaseCode = ad.CaseCode AND cs.SizeCount = 1)) r
             WHERE oo.ITAtt05 = 'Karma'

            UPDATE oo SET oo.ReceivedQuantity = ISNULL(r.Quantity,0)
              FROM #OpenOrder oo
              OUTER APPLY (SELECT Quantity = SUM(Quantity) FROM #AsnDetail ad
                            WHERE ad.ItemDim1Code = oo.ItemDim1Code AND ad.ItemDim2Code = oo.ItemDim2Code                              AND EXISTS (SELECT NULL FROM #CaseStatus cs WHERE cs.CaseCode = ad.CaseCode AND cs.SizeCount > 1)) r
             WHERE oo.ITAtt05 != 'Karma'

            UPDATE oo SET oo.OtherQuantity = ISNULL(r.Quantity,0) - ISNULL(IIF(ISNULL(r.Quantity,0) > ISNULL(oq.OpenQuantity,0), ISNULL(oq.OpenQuantity,0), ISNULL(r.Quantity,0)),0)
              FROM #OpenOrder oo
              LEFT JOIN #OpenOrder oq ON oq.ItemDim1Code = oo.ItemDim1Code AND oq.ItemDim2Code = oo.ItemDim2Code AND oq.ITAtt05 != oo.ITAtt05
              OUTER APPLY (SELECT Quantity = SUM(Quantity) FROM #AsnDetail ad
                            WHERE ad.ItemDim1Code = oo.ItemDim1Code AND ad.ItemDim2Code = oo.ItemDim2Code                              AND EXISTS (SELECT NULL FROM #CaseStatus cs WHERE cs.CaseCode = ad.CaseCode AND cs.SizeCount > 1)) r
             WHERE oo.ITAtt05 = 'Karma'

            UPDATE oo SET oo.OtherQuantity = ISNULL(r.Quantity,0) - ISNULL(IIF(ISNULL(r.Quantity,0) > ISNULL(oq.OpenQuantity,0), ISNULL(oq.OpenQuantity,0), ISNULL(r.Quantity,0)),0)
              FROM #OpenOrder oo
              LEFT JOIN #OpenOrder oq ON oq.ItemDim1Code = oo.ItemDim1Code AND oq.ItemDim2Code = oo.ItemDim2Code AND oq.ITAtt05 != oo.ITAtt05
              OUTER APPLY (SELECT Quantity = SUM(Quantity) FROM #AsnDetail ad
                            WHERE ad.ItemDim1Code = oo.ItemDim1Code AND ad.ItemDim2Code = oo.ItemDim2Code                              AND EXISTS (SELECT NULL FROM #CaseStatus cs WHERE cs.CaseCode = ad.CaseCode AND cs.SizeCount = 1)) r
             WHERE oo.ITAtt05 != 'Karma'

            IF NOT EXISTS (SELECT NULL FROM #OpenOrder WHERE OpenQuantity > ReceivedQuantity)
                GOTO EndCheck

            IF OBJECT_ID('tempdb..#NextOrder') IS NOT NULL DROP TABLE #NextOrder

            SELECT ol.ItemDim1Code, ol.ItemDim2Code, OpenQuantity = SUM(ol.OpenQuantity)
              INTO #NextOrder
              FROM ext.OrderHeader oh
              LEFT JOIN ext.OrderLine ol ON ol.Company = @Company AND ol.OrderHeaderId = oh.OrderHeaderId
             WHERE oh.Company = @Company
               AND oh.CurrAccCode = @VendorCode
               AND ol.ItemCode = @ItemCode
               AND ol.ColorCode = @ColorCode
               AND ISNULL(ol.PurchaseOrderNo,'') = ISNULL(@PurchaseOrderNo,'')
               AND ISNULL(ol.ITAtt03,'') = ISNULL(@ITAtt03,'')
               AND ol.OpenQuantity > 0
               AND @CheckNextOrder = 1
             GROUP BY ol.ItemDim1Code, ol.ItemDim2Code

            UPDATE oo SET oo.NextOrder = ISNULL(r.Quantity,0)
              FROM #OpenOrder oo
              OUTER APPLY (SELECT Quantity = SUM(OpenQuantity) FROM #NextOrder n
                            WHERE n.ItemDim1Code = oo.ItemDim1Code AND n.ItemDim2Code = oo.ItemDim2Code) r
             WHERE OpenQuantity > ReceivedQuantity
               AND @CheckNextOrder = 1

            UPDATE oo SET oo.ReceivedQuantity = ReceivedQuantity + ISNULL(CASE WHEN (OpenQuantity - ReceivedQuantity - NextOrder) > OtherQuantity THEN OtherQuantity
                                                                               WHEN (OpenQuantity - ReceivedQuantity - NextOrder) <= OtherQuantity THEN (OpenQuantity - ReceivedQuantity - NextOrder) END, 0)
              FROM #OpenOrder oo
             WHERE OpenQuantity > ReceivedQuantity
               AND OtherQuantity > 0
               AND @CheckNextOrder = 1

            UPDATE oo SET oo.Less = CASE WHEN (ReceivedQuantity - OpenQuantity) <= NextOrder THEN (ReceivedQuantity - OpenQuantity) ELSE NextOrder END
              FROM #OpenOrder oo
             WHERE OpenQuantity > ReceivedQuantity
               AND @CheckNextOrder = 1

            DELETE FROM dbo.NextOrder WHERE RequestId = @RequestId

            INSERT INTO dbo.NextOrder (RequestId, ItemDim1Code, ItemDim2Code, OpenQuantity)
            SELECT @RequestId, ItemDim1Code, ItemDim2Code, OpenQuantity
              FROM #NextOrder

            DELETE FROM dbo.OpenOrder WHERE RequestId = @RequestId

            INSERT INTO dbo.OpenOrder (RequestId, ItemDim1Code, ItemDim2Code, ITAtt05, OpenQuantity, ReceivedQuantity, NextOrder, Less, OtherQuantity)
            SELECT @RequestId, ItemDim1Code, ItemDim2Code, ITAtt05, OpenQuantity, ReceivedQuantity, NextOrder, Less, OtherQuantity
              FROM #OpenOrder

EndCheck:
        END

        IF NOT EXISTS (SELECT NULL FROM dbo.OpenOrder WHERE RequestId = @RequestId)
        BEGIN
            UPDATE oo SET oo.ReceivedQuantity = ISNULL(r.Quantity,0)
              FROM #OpenOrder oo
              OUTER APPLY (SELECT Quantity = SUM(Quantity) FROM dbo.ReceivedOrder ro
                            WHERE ro.RequestId = @RequestId AND ro.ItemDim1Code = oo.ItemDim1Code AND ro.ItemDim2Code = oo.ItemDim2Code) r
             WHERE oo.ReceivedQuantity = 0

            UPDATE oo SET oo.Less = CASE WHEN ReceivedQuantity >= OpenQuantity THEN 0 ELSE ReceivedQuantity - OpenQuantity END
              FROM #OpenOrder oo
             WHERE oo.Less = 0 AND oo.ReceivedQuantity > 0

            DELETE FROM dbo.OpenOrder WHERE RequestId = @RequestId

            INSERT INTO dbo.OpenOrder (RequestId, ItemDim1Code, ItemDim2Code, ITAtt05, OpenQuantity, ReceivedQuantity, NextOrder, Less, OtherQuantity)
            SELECT @RequestId, ItemDim1Code, ItemDim2Code, ITAtt05, OpenQuantity, ReceivedQuantity, NextOrder, Less, OtherQuantity
              FROM #OpenOrder
        END

        -- Less cursor: eksik ürünleri ters sıra ile müşterilerden düş
        DECLARE CustomerCursor CURSOR FOR
            SELECT CurrAccTypeCode, CurrAccCode, SubCurrAccId, SubCurrAccCode
              FROM #ChannelTemplate ct
             WHERE (@Exception = 0 OR ct.Exception = 1)
             ORDER BY Priority DESC, SortOrder DESC

        OPEN CustomerCursor
        WHILE EXISTS (SELECT NULL FROM #OpenOrder WHERE Less < 0)
        BEGIN
            FETCH CustomerCursor INTO @CurrAccTypeCode, @CurrAccCode, @SubCurrAccId, @SubCurrAccCode
            IF @@FETCH_STATUS != 0 BREAK

            DECLARE ReferenceCursor CURSOR FOR
                SELECT ReferenceOrderId, ro.ItemDim1Code, ro.ItemDim2Code, OpenQuantity, ITAtt05 = ISNULL(ITAtt05,'')
                  FROM dbo.ReferenceOrder ro
                 WHERE RequestId = @RequestId
                   AND ro.CurrAccTypeCode = @CurrAccTypeCode AND ro.CurrAccCode = @CurrAccCode
                   AND ISNULL(ro.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER)) = ISNULL(@SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER))
                   AND NOT EXISTS (SELECT NULL FROM dbo.ExceptionStoreList esl WHERE esl.CurrAccTypeCode = ro.CurrAccTypeCode AND esl.CurrAccCode = ro.CurrAccCode)
                   AND EXISTS (SELECT NULL FROM #OpenOrder oo WHERE oo.ItemDim1Code = ro.ItemDim1Code AND oo.ItemDim2Code = ro.ItemDim2Code AND oo.Less < 0)

            OPEN ReferenceCursor
            WHILE EXISTS (SELECT NULL FROM #OpenOrder WHERE Less < 0)
            BEGIN
                FETCH ReferenceCursor INTO @ReferenceOrderId, @ItemDim1Code, @ItemDim2Code, @OpenQuantity, @ITAtt05
                IF @@FETCH_STATUS != 0 BREAK

                SELECT @Less = ABS(Less) FROM #OpenOrder oo
                 WHERE oo.ItemDim1Code = @ItemDim1Code AND oo.ItemDim2Code = @ItemDim2Code AND oo.ITAtt05 = @ITAtt05

                IF @OpenQuantity > @Less SET @CurrentQuantity = @Less
                ELSE SET @CurrentQuantity = @OpenQuantity

                UPDATE ro SET ro.OpenQuantity = ro.OpenQuantity - @CurrentQuantity FROM dbo.ReferenceOrder ro WHERE ReferenceOrderId = @ReferenceOrderId

                UPDATE oo SET oo.Less = oo.Less + @CurrentQuantity FROM #OpenOrder oo
                 WHERE oo.ItemDim1Code = @ItemDim1Code AND oo.ItemDim2Code = @ItemDim2Code AND oo.ITAtt05 = @ITAtt05
            END
            CLOSE ReferenceCursor
            DEALLOCATE ReferenceCursor
        END
        CLOSE CustomerCursor
        DEALLOCATE CustomerCursor

        UPDATE ro SET ro.OriginalQuantity = ro.Quantity
                     ,ro.Quantity = IIF(@Exception=1, ISNULL(o.ReceivedQuantity, ro.Quantity), ro.Quantity)
          FROM dbo.ReceivedOrder ro
          OUTER APPLY (SELECT ReceivedQuantity = SUM(oo.ReceivedQuantity) FROM #OpenOrder oo
                        WHERE oo.ItemDim1Code = ro.ItemDim1Code AND oo.ItemDim2Code = ro.ItemDim2Code) o
         WHERE ro.RequestId = @RequestId
           AND @Exception = 0
    END

    IF NOT EXISTS (SELECT NULL FROM dbo.ReferenceOrder WHERE RequestId = @RequestId AND OpenQuantity > 0)
    BEGIN
        UPDATE dbo.Request
           SET StatusId = 3, Explanation = N'Referans sipariş yok', CompletedDate = GETDATE(), AllocatedDate = GETDATE()
         WHERE RequestId = @RequestId
        COMMIT
        RETURN
    END

    IF NOT EXISTS (SELECT NULL
                     FROM (SELECT ItemDim1Code, ItemDim2Code, OpenQuantity = SUM(OpenQuantity)
                             FROM dbo.ReferenceOrder WHERE RequestId = @RequestId
                            GROUP BY ItemDim1Code, ItemDim2Code) ref
                     JOIN (SELECT ItemDim1Code, ItemDim2Code, Quantity = SUM(Quantity)
                             FROM dbo.ReceivedOrder WHERE RequestId = @RequestId AND Quantity > 0
                            GROUP BY ItemDim1Code, ItemDim2Code) rec
                       ON rec.ItemDim1Code = ref.ItemDim1Code AND rec.ItemDim2Code = ref.ItemDim2Code)
    BEGIN
        UPDATE dbo.Request
           SET StatusId = 3, Explanation = N'Referans sipariş ile ASN eşleşmiyor', CompletedDate = GETDATE(), AllocatedDate = GETDATE()
         WHERE RequestId = @RequestId
        COMMIT
        RETURN
    END

    BEGIN TRY
        DECLARE CustomerCursor CURSOR FOR
            SELECT CurrAccTypeCode, CurrAccCode, SubCurrAccId, SubCurrAccCode, Exception
              FROM #ChannelTemplate ct
             WHERE (@Exception = 0 OR ct.Exception = 1)
             ORDER BY Priority, SortOrder

        SET @IsWT = 0
        SET @OrderCount = 0

        OPEN CustomerCursor

        WHILE 1=1
        BEGIN
            FETCH CustomerCursor INTO @CurrAccTypeCode, @CurrAccCode, @SubCurrAccId, @SubCurrAccCode, @TemplateException
            IF @@FETCH_STATUS != 0 BREAK

            SET @CustomerCompleted = 0

            IF OBJECT_ID('tempdb..#ReferenceOrder') IS NOT NULL DROP TABLE #ReferenceOrder

            SELECT ReferenceOrderId, ro.ItemDim1Code, ro.ItemDim2Code
                  ,OpenQuantity, ProcessCode, ITAtt05, OrderHeaderId, OrderLineId
                  ,AllocationQuantity = 0
                  ,RowNumber = ROW_NUMBER() OVER (PARTITION BY OrderHeaderId ORDER BY ReferenceOrderId)
              INTO #ReferenceOrder
              FROM dbo.ReferenceOrder ro
             WHERE RequestId = @RequestId
               AND ro.CurrAccTypeCode = @CurrAccTypeCode AND ro.CurrAccCode = @CurrAccCode
               AND ISNULL(ro.SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER)) = ISNULL(@SubCurrAccId,CAST(0x0 AS UNIQUEIDENTIFIER))
               AND EXISTS (SELECT NULL FROM dbo.ReceivedOrder rec
                            WHERE RequestId = @RequestId AND rec.ItemDim1Code = ro.ItemDim1Code AND rec.ItemDim2Code = ro.ItemDim2Code)

            IF @Exception = 0 AND @TemplateException = 1 AND EXISTS (SELECT NULL FROM #ReferenceOrder)
            BEGIN
                IF NOT EXISTS (SELECT NULL FROM dbo.Request WHERE ReferenceId = @RequestId)
                BEGIN
                    INSERT INTO dbo.Request (InboundAsnId, Company, ReferenceId, IsReturn, AsnNo, PurchaseOrderNo, ItemCode, ColorCode, StatusId, CreatedDate, AllocatedDate, CompletedDate, WarehouseCode, Explanation, ITAtt03, Exception)
                    SELECT InboundAsnId, Company, ReferenceId = r.RequestId, IsReturn, AsnNo, PurchaseOrderNo, ItemCode, ColorCode, StatusId, CreatedDate, AllocatedDate, CompletedDate, WarehouseCode, Explanation, ITAtt03, Exception = 1
                      FROM dbo.Request r WHERE r.RequestId = @RequestId
                END
                SET @IsWT = 1
                CONTINUE
            END

            DECLARE ReferenceCursor CURSOR FOR
                SELECT ReferenceOrderId, ItemDim1Code, ItemDim2Code, OpenQuantity, ProcessCode, OrderHeaderId, OrderLineId, AllocationQuantity
                  FROM #ReferenceOrder ORDER BY ItemDim1Code, ItemDim2Code

            OPEN ReferenceCursor
            WHILE 1=1
            BEGIN
                FETCH ReferenceCursor INTO @ReferenceOrderId, @ItemDim1Code, @ItemDim2Code, @OpenQuantity, @ProcessCode, @OrderHeaderId, @OrderLineId, @AllocationQuantity
                IF @@FETCH_STATUS != 0 BREAK

                DECLARE ReceivedCursor CURSOR FOR
                    SELECT ReceivedOrderId, Quantity = Quantity - ISNULL(AllocationQuantity,0)
                      FROM dbo.ReceivedOrder
                     WHERE RequestId = @RequestId AND ItemDim1Code = @ItemDim1Code AND ItemDim2Code = @ItemDim2Code                       AND Quantity - ISNULL(AllocationQuantity,0) > 0

                OPEN ReceivedCursor
                WHILE 1=1
                BEGIN
                    FETCH ReceivedCursor INTO @ReceivedOrderId, @ReceivedQuantity
                    IF @@FETCH_STATUS != 0 BREAK

                    IF @ReceivedQuantity >= @OpenQuantity
                    BEGIN
                        UPDATE ro SET ro.AllocationQuantity = ISNULL(ro.AllocationQuantity,0) + @OpenQuantity FROM #ReferenceOrder ro WHERE ro.ReferenceOrderId = @ReferenceOrderId
                        UPDATE ro SET ro.AllocationQuantity = ISNULL(ro.AllocationQuantity,0) + @OpenQuantity FROM dbo.ReceivedOrder ro WHERE ro.ReceivedOrderId = @ReceivedOrderId
                        SET @AllocationQuantity += @OpenQuantity
                        SET @OpenQuantity = 0
                    END
                    ELSE
                    BEGIN
                        UPDATE ro SET ro.AllocationQuantity = ISNULL(ro.AllocationQuantity,0) + @ReceivedQuantity FROM #ReferenceOrder ro WHERE ro.ReferenceOrderId = @ReferenceOrderId
                        UPDATE ro SET ro.AllocationQuantity = ISNULL(ro.AllocationQuantity,0) + @ReceivedQuantity FROM dbo.ReceivedOrder ro WHERE ro.ReceivedOrderId = @ReceivedOrderId
                        SET @AllocationQuantity += @ReceivedQuantity
                        SET @OpenQuantity -= @ReceivedQuantity
                    END
                END
                CLOSE ReceivedCursor
                DEALLOCATE ReceivedCursor
            END
            CLOSE ReferenceCursor
            DEALLOCATE ReferenceCursor

            DELETE FROM @DraftOrderHeader

            INSERT INTO dbo.DraftOrderHeader
            (RequestId, ProcessCode, CurrAccTypeCode, CurrAccCode, SubCurrAccCode, SubCurrAccId
            ,Description, OfficeCode, PaymentTerm, ShipmentMethodCode, PaymentMethodCode, IncotermCode1
            ,ATAtt01, ATAtt02, DocCurrencyCode, ShippingPostalAddressId, BillingPostalAddressId
            ,OrderHeaderId, OrderQueueId, IsOrdered, IsPool)
            OUTPUT INSERTED.DraftOrderHeaderId, INSERTED.OrderHeaderId, INSERTED.IsPool INTO @DraftOrderHeader
            SELECT ro.RequestId, ro.ProcessCode, ro.CurrAccTypeCode, ro.CurrAccCode, ro.SubCurrAccCode, ro.SubCurrAccId
                  ,ro.Description, ro.OfficeCode, ro.PaymentTerm, ro.ShipmentMethodCode, ro.PaymentMethodCode, ro.IncotermCode1
                  ,ro.ATAtt01, ro.ATAtt02, ro.DocCurrencyCode, ro.ShippingPostalAddressId, ro.BillingPostalAddressId
                  ,ro.OrderHeaderId, OrderQueueId = -1, IsOrdered = 1, IsPool = 0
              FROM dbo.ReferenceOrder ro
              JOIN #ReferenceOrder r ON r.ReferenceOrderId = ro.ReferenceOrderId
             WHERE ro.RequestId = @RequestId
               AND ro.CurrAccTypeCode = @CurrAccTypeCode AND ro.CurrAccCode = @CurrAccCode
               AND r.RowNumber = 1
               AND ISNULL(ro.SubCurrAccId,0x0) = ISNULL(@SubCurrAccId,0x0)

            SET @OrderCount += @@ROWCOUNT

            INSERT INTO dbo.DraftOrderLine (DraftOrderHeaderId, ItemDim1Code, ItemDim2Code, DocCurrencyCode, ITAtt01, ITAtt02, ITAtt03, ITAtt04, Quantity, OrderLineId)
            SELECT doh.DraftOrderHeaderId, ro.ItemDim1Code, ro.ItemDim2Code
                  ,ro.DocCurrencyCode, ro.ITAtt01, ro.ITAtt02, ro.ITAtt03, ro.ITAtt04
                  ,Quantity = r.AllocationQuantity, ro.OrderLineId
              FROM @DraftOrderHeader doh
              JOIN #ReferenceOrder r ON r.OrderHeaderId = doh.OrderHeaderId
              JOIN dbo.ReferenceOrder ro ON ro.ReferenceOrderId = r.ReferenceOrderId
             WHERE doh.IsPool = 0 AND r.AllocationQuantity > 0

            DELETE doh FROM dbo.DraftOrderHeader doh
             WHERE EXISTS (SELECT NULL FROM @DraftOrderHeader d WHERE d.DraftOrderHeaderId = doh.DraftOrderHeaderId)
               AND NOT EXISTS (SELECT NULL FROM dbo.DraftOrderLine dol WHERE dol.DraftOrderHeaderId = doh.DraftOrderHeaderId)
        END

        CLOSE CustomerCursor
        DEALLOCATE CustomerCursor

        IF @OrderCount = 0 AND @IsWT = 1
        BEGIN
            UPDATE dbo.Request
               SET StatusId = 2, AllocatedDate = GETDATE(), CompletedDate = GETDATE()
                  ,Explanation = N'Exception dışında müşteri olmadığı için request işlem görmeyecek.'
             WHERE RequestId = @RequestId
        END
        ELSE
        BEGIN
            UPDATE dbo.Request
               SET StatusId = 2, AllocatedDate = GETDATE()
             WHERE RequestId = @RequestId
        END

        COMMIT

        UPDATE i SET i.Status = N'Alokasyon Yapıldı'
          FROM dbo.Inbound i
          JOIN dbo.InboundAsn ia ON ia.InboundId = i.InboundId
          OUTER APPLY (SELECT RequestCount = COUNT(*), CompletedCount = SUM(IIF(r.CompletedDate IS NOT NULL,1,0))
                         FROM dbo.Request r WHERE r.InboundAsnId = ia.InboundAsnId) x
         WHERE x.RequestCount = x.CompletedCount
           AND i.Status = N'Alokasyon Yapılıyor'

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        DECLARE @ErrMsg NVARCHAR(MAX) = ERROR_MESSAGE();
        EXEC dbo.SaveErrorLog @ErrorMessage = @ErrMsg, @ErrorSource = N'dbo.Allocation', @RaiseError = 0;
        THROW;
    END CATCH;
END
GO

PRINT 'dbo.Allocation oluşturuldu.';
GO
