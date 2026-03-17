-- ============================================================
-- ORCA ASN Portalı – dbo.CreateRequest
-- IsAllocation = 1 olan InboundAsn için Request + ReceivedOrder oluşturur.
-- Referans: Union_B2B\Union.Olka.Portal\SQL\OlkaAlokasyon.sql
-- ============================================================

USE [OrcaAlokasyon]
GO

-- CreateRequest bu view'a bağımlı; eski kurulumlarda ItemDim3Code kaldırıldıysa view'ı güncelle
CREATE OR ALTER VIEW dbo.ReceivedOrderSummary AS
SELECT ia.InboundAsnId
      ,ia.AsnNo
      ,ial.PurchaseOrderNo
      ,ial.ITAtt03
      ,ial.ProductCode
      ,ial.ColorCode
      ,LotCode         = CAST(NULL AS NVARCHAR(10))
      ,ial.ItemDim1Code
      ,ial.ItemDim2Code
      ,Quantity         = SUM(ial.Quantity)
      ,InboundQuantity  = SUM(ial.Quantity)
      ,LotQuantity      = CAST(NULL AS INT)
  FROM dbo.InboundAsn ia
  JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = ia.InboundAsnId
 WHERE ia.AsnNo IS NOT NULL
 GROUP BY ia.InboundAsnId
         ,ia.AsnNo
         ,ial.PurchaseOrderNo
         ,ial.ITAtt03
         ,ial.ProductCode
         ,ial.ColorCode
         ,ial.ItemDim1Code
         ,ial.ItemDim2Code;
GO

CREATE OR ALTER PROCEDURE [dbo].[CreateRequest]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RequestId INT
    DECLARE @InboundAsnId INT
    DECLARE @CompanyCode NVARCHAR(10)
    DECLARE @IsReturn BIT
    DECLARE @AsnNo NVARCHAR(30)
    DECLARE @PurchaseOrderNo NVARCHAR(50)
    DECLARE @ITAtt03 NVARCHAR(50)
    DECLARE @ProductCode NVARCHAR(30)
    DECLARE @ColorCode NVARCHAR(10)
    DECLARE @WarehouseCode NVARCHAR(10)

    BEGIN TRY
        BEGIN TRAN

        DECLARE RequestCursor CURSOR FOR
        SELECT ia.InboundAsnId
            ,i.CompanyCode
            ,ia.IsReturn
            ,ia.AsnNo
            ,ial.PurchaseOrderNo
            ,ial.ITAtt03
            ,ial.ProductCode
            ,ial.ColorCode
            ,ia.WarehouseCode
        FROM dbo.InboundAsn ia
        JOIN dbo.InboundAsnLine ial ON ial.InboundAsnId = ia.InboundAsnId
        JOIN dbo.Inbound i ON i.InboundId = ia.InboundId
        WHERE ia.AsnNo IS NOT NULL
        AND ia.IsAllocation = 1
        AND NOT EXISTS (SELECT NULL FROM dbo.Request r
            WHERE r.Company = i.CompanyCode
            AND ISNULL(r.PurchaseOrderNo,'') = ISNULL(ial.PurchaseOrderNo,'')
            AND ISNULL(r.ITAtt03,'') = ISNULL(ial.ITAtt03,'')
            AND r.AsnNo = ia.AsnNo
            AND r.InboundAsnId = ial.InboundAsnId
            AND r.ItemCode = ial.ProductCode
            AND r.ColorCode = ial.ColorCode)
        GROUP BY ia.InboundAsnId
            ,i.CompanyCode
            ,ia.IsReturn
            ,ia.AsnNo
            ,ial.PurchaseOrderNo
            ,ial.ITAtt03
            ,ial.ProductCode
            ,ial.ColorCode
            ,ia.WarehouseCode

        OPEN RequestCursor

        WHILE 1=1
        BEGIN
            FETCH RequestCursor
            INTO @InboundAsnId,@CompanyCode,@IsReturn,@AsnNo,@PurchaseOrderNo,@ITAtt03,@ProductCode,@ColorCode,@WarehouseCode

            IF @@FETCH_STATUS <> 0
                BREAK

            INSERT INTO dbo.Request
            (
                InboundAsnId
                ,Company
                ,IsReturn
                ,AsnNo
                ,PurchaseOrderNo
                ,ITAtt03
                ,ItemCode
                ,ColorCode
                ,StatusId
                ,CreatedDate
                ,WarehouseCode
            )
            VALUES
            (
                @InboundAsnId
                ,@CompanyCode
                ,@IsReturn
                ,@AsnNo
                ,@PurchaseOrderNo
                ,@ITAtt03
                ,@ProductCode
                ,@ColorCode
                ,1
                ,GETDATE()
                ,@WarehouseCode
            )

            SET @RequestId = SCOPE_IDENTITY()

            INSERT INTO dbo.ReceivedOrder
            (
                RequestId
                ,LotCode
                ,ItemDim1Code
                ,ItemDim2Code
                ,Quantity
                ,LotQuantity
            )
            SELECT @RequestId
                ,ro.LotCode
                ,ro.ItemDim1Code
                ,ro.ItemDim2Code
                ,ro.InboundQuantity
                ,ro.LotQuantity
            FROM dbo.ReceivedOrderSummary ro
            WHERE ro.InboundAsnId = @InboundAsnId
            AND ISNULL(ro.PurchaseOrderNo,'') = ISNULL(@PurchaseOrderNo,'')
            AND ISNULL(ro.ITAtt03,'') = ISNULL(@ITAtt03,'')
            AND ro.ProductCode = @ProductCode
            AND ro.ColorCode = @ColorCode
        END

        CLOSE RequestCursor
        DEALLOCATE RequestCursor

        COMMIT
    END TRY
    BEGIN CATCH
        ROLLBACK

        DECLARE @ErrMsg NVARCHAR(MAX) = ERROR_MESSAGE();
        EXEC dbo.SaveErrorLog
            @ErrorMessage = @ErrMsg,
            @ErrorSource  = N'dbo.CreateRequest',
            @RaiseError   = 0;

        RETURN
    END CATCH

END
GO

PRINT 'dbo.CreateRequest oluşturuldu.';
GO
