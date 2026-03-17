-- ============================================================
-- ORCA ASN Portali - ext view'lar (OlkaB2BPortal tarzi, anlik ERP sorgulama)
-- OrderHeader, OrderLine, ItemBarcode tablo degil view; linked server uzerinden ERP'den okunur.
-- Synonym kullanilmaz; dogrudan linked server adresi (MARLINV3.dbo.xxx) tercih edilir.
-- ============================================================

USE [OrcaAlokasyon]
GO

-- Mevcut tablolar/viewlar varsa kaldir
IF OBJECT_ID(N'ext.OrderHeader', N'U') IS NOT NULL   DROP TABLE ext.OrderHeader;
IF OBJECT_ID(N'ext.OrderHeader', N'V') IS NOT NULL   DROP VIEW ext.OrderHeader;
IF OBJECT_ID(N'ext.OrderLine', N'U') IS NOT NULL     DROP TABLE ext.OrderLine;
IF OBJECT_ID(N'ext.OrderLine', N'V') IS NOT NULL     DROP VIEW ext.OrderLine;
IF OBJECT_ID(N'ext.ItemBarcode', N'U') IS NOT NULL   DROP TABLE ext.ItemBarcode;
IF OBJECT_ID(N'ext.ItemBarcode', N'V') IS NOT NULL   DROP VIEW ext.ItemBarcode;
IF OBJECT_ID(N'ext.SubCustomer', N'U') IS NOT NULL   DROP TABLE ext.SubCustomer;
IF OBJECT_ID(N'ext.SubCustomer', N'V') IS NOT NULL   DROP VIEW ext.SubCustomer;
GO

-- =========================
-- ext.OrderHeader
-- =========================
CREATE VIEW ext.OrderHeader
AS
SELECT Company                     = N'OLKA'
            , oh.OrderHeaderId
            , oh.OrderTypeCode
            , oh.ProcessCode
            , oh.OrderNumber
            , oh.OrderDate
            , oh.OrderTime
            , oh.DocumentNumber
            , oh.PaymentTerm
            , oh.AverageDueDate
            , oh.Description
            , oh.InternalDescription
            , oh.CurrAccTypeCode
            , oh.CurrAccCode
            , oh.SubCurrAccId
            , oh.ContactId
            , oh.ShipmentMethodCode
            , oh.ShippingPostalAddressId
            , oh.BillingPostalAddressId
            , oh.GuarantorContactId
            , oh.GuarantorContactId2
            , oh.RoundsmanCode
            , oh.DeliveryCompanyCode
            , oh.TaxTypeCode
            , oh.DOVCode
            , oh.TaxExemptionCode
            , oh.CompanyCode
            , oh.OfficeCode
            , oh.StoreTypeCode
            , oh.StoreCode
            , oh.POSTerminalId
            , oh.WarehouseCode
            , oh.ToWarehouseCode
            , oh.OrdererCompanyCode
            , oh.OrdererOfficeCode
            , oh.OrdererStoreCode
            , oh.GLTypeCode
            , oh.DocCurrencyCode
            , oh.LocalCurrencyCode
            , oh.ExchangeRate
            , oh.TDisRate1
            , oh.TDisRate2
            , oh.TDisRate3
            , oh.TDisRate4
            , oh.TDisRate5
            , oh.DiscountReasonCode
            , oh.SurplusOrderQtyToleranceRate
            , oh.ImportFileNumber
            , oh.ExportFileNumber
            , oh.IncotermCode1
            , oh.IncotermCode2
            , oh.LettersOfCreditNumber
            , oh.PaymentMethodCode
            , oh.IsInclutedVat
            , oh.IsCreditSale
            , oh.IsCreditableConfirmed
            , oh.IsSuspended
            , oh.IsCompleted
            , oh.IsPrinted
            , oh.IsLocked
            , oh.IsClosed
            , oh.ApplicationCode
            , oh.ApplicationId
            , oh.CreatedUserName
            , oh.CreatedDate
            , oh.LastUpdatedUserName
            , oh.LastUpdatedDate
            , oh.UserLocked
            , oh.IsCancelOrder
            , oh.IsSalesViaInternet
            , oh.CreditableConfirmedUser
            , oh.CreditableConfirmedDate
            , oh.WithHoldingTaxTypeCode
            , oh.IsProposalBased
            , ATAtt01                             = oa1.AttributeCode
            , ATAtt02                             = oa2.AttributeCode
            , OrderType                           = CAST(NULL AS NVARCHAR(30))
            , capa.CountryCode
    FROM OlkaV3.dbo.trOrderHeader oh WITH (NOLOCK)
                        LEFT JOIN OlkaV3.dbo.tpOrderATAttribute oa1 WITH (NOLOCK) ON oa1.OrderHeaderId = oh.OrderHeaderId
                                                                                AND oa1.AttributeTypeCode = 1
                        LEFT JOIN OlkaV3.dbo.tpOrderATAttribute oa2 WITH (NOLOCK) ON oa2.OrderHeaderId = oh.OrderHeaderId
                                                                                AND oa2.AttributeTypeCode = 2
                        LEFT JOIN OlkaV3.dbo.prCurrAccPostalAddress capa WITH (NOLOCK) ON capa.PostalAddressId = oh.ShippingPostalAddressID
                        LEFT JOIN dbo.cdWarehouse wc ON wc.Company = N'OLKA'
                                                        AND wc.WarehouseCode = oh.WarehouseCode
  WHERE oh.CompanyCode = 1
      AND NOT EXISTS (SELECT NULL FROM dbo.AllocationExcludedWarehouse aew
                                        WHERE aew.Company = 'OLKA'
                                            AND aew.WarehouseCode = oh.WarehouseCode)
UNION ALL
SELECT Company                     = N'MARLIN'
            , oh.OrderHeaderId
            , oh.OrderTypeCode
            , oh.ProcessCode
            , oh.OrderNumber
            , oh.OrderDate
            , oh.OrderTime
            , oh.DocumentNumber
            , oh.PaymentTerm
            , oh.AverageDueDate
            , oh.Description
            , oh.InternalDescription
            , oh.CurrAccTypeCode
            , oh.CurrAccCode
            , oh.SubCurrAccId
            , oh.ContactId
            , oh.ShipmentMethodCode
            , oh.ShippingPostalAddressId
            , oh.BillingPostalAddressId
            , oh.GuarantorContactId
            , oh.GuarantorContactId2
            , oh.RoundsmanCode
            , oh.DeliveryCompanyCode
            , oh.TaxTypeCode
            , oh.DOVCode
            , oh.TaxExemptionCode
            , oh.CompanyCode
            , oh.OfficeCode
            , oh.StoreTypeCode
            , oh.StoreCode
            , oh.POSTerminalId
            , oh.WarehouseCode
            , oh.ToWarehouseCode
            , oh.OrdererCompanyCode
            , oh.OrdererOfficeCode
            , oh.OrdererStoreCode
            , oh.GLTypeCode
            , oh.DocCurrencyCode
            , oh.LocalCurrencyCode
            , oh.ExchangeRate
            , oh.TDisRate1
            , oh.TDisRate2
            , oh.TDisRate3
            , oh.TDisRate4
            , oh.TDisRate5
            , oh.DiscountReasonCode
            , oh.SurplusOrderQtyToleranceRate
            , oh.ImportFileNumber
            , oh.ExportFileNumber
            , oh.IncotermCode1
            , oh.IncotermCode2
            , oh.LettersOfCreditNumber
            , oh.PaymentMethodCode
            , oh.IsInclutedVat
            , oh.IsCreditSale
            , oh.IsCreditableConfirmed
            , oh.IsSuspended
            , oh.IsCompleted
            , oh.IsPrinted
            , oh.IsLocked
            , oh.IsClosed
            , oh.ApplicationCode
            , oh.ApplicationId
            , oh.CreatedUserName
            , oh.CreatedDate
            , oh.LastUpdatedUserName
            , oh.LastUpdatedDate
            , oh.UserLocked
            , oh.IsCancelOrder
            , oh.IsSalesViaInternet
            , oh.CreditableConfirmedUser
            , oh.CreditableConfirmedDate
            , oh.WithHoldingTaxTypeCode
            , oh.IsProposalBased
            , ATAtt01                             = oa1.AttributeCode
            , ATAtt02                             = oa2.AttributeCode
            , OrderType                           = CAST(NULL AS NVARCHAR(30))
            , capa.CountryCode
    FROM MARLINV3.dbo.trOrderHeader oh WITH (NOLOCK)
                        LEFT JOIN MARLINV3.dbo.tpOrderATAttribute oa1 WITH (NOLOCK) ON oa1.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN MARLINV3.dbo.tpOrderATAttribute oa2 WITH (NOLOCK) ON oa2.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN MARLINV3.dbo.prCurrAccPostalAddress capa WITH (NOLOCK) ON capa.PostalAddressId = oh.ShippingPostalAddressID
                        LEFT JOIN dbo.cdWarehouse wc ON wc.Company = N'MARLIN'
                                                        AND wc.WarehouseCode = oh.WarehouseCode
  WHERE oh.CompanyCode = 1
      AND NOT EXISTS (SELECT NULL FROM dbo.AllocationExcludedWarehouse aew
                                        WHERE aew.Company = 'MARLIN'
                                            AND aew.WarehouseCode = oh.WarehouseCode)
UNION ALL
SELECT Company                     = N'JUPITER'
            , oh.OrderHeaderId
            , oh.OrderTypeCode
            , oh.ProcessCode
            , oh.OrderNumber
            , oh.OrderDate
            , oh.OrderTime
            , oh.DocumentNumber
            , oh.PaymentTerm
            , oh.AverageDueDate
            , oh.Description
            , oh.InternalDescription
            , oh.CurrAccTypeCode
            , oh.CurrAccCode
            , oh.SubCurrAccId
            , oh.ContactId
            , oh.ShipmentMethodCode
            , oh.ShippingPostalAddressId
            , oh.BillingPostalAddressId
            , oh.GuarantorContactId
            , oh.GuarantorContactId2
            , oh.RoundsmanCode
            , oh.DeliveryCompanyCode
            , oh.TaxTypeCode
            , oh.DOVCode
            , oh.TaxExemptionCode
            , oh.CompanyCode
            , oh.OfficeCode
            , oh.StoreTypeCode
            , oh.StoreCode
            , oh.POSTerminalId
            , oh.WarehouseCode
            , oh.ToWarehouseCode
            , oh.OrdererCompanyCode
            , oh.OrdererOfficeCode
            , oh.OrdererStoreCode
            , oh.GLTypeCode
            , oh.DocCurrencyCode
            , oh.LocalCurrencyCode
            , oh.ExchangeRate
            , oh.TDisRate1
            , oh.TDisRate2
            , oh.TDisRate3
            , oh.TDisRate4
            , oh.TDisRate5
            , oh.DiscountReasonCode
            , oh.SurplusOrderQtyToleranceRate
            , oh.ImportFileNumber
            , oh.ExportFileNumber
            , oh.IncotermCode1
            , oh.IncotermCode2
            , oh.LettersOfCreditNumber
            , oh.PaymentMethodCode
            , oh.IsInclutedVat
            , oh.IsCreditSale
            , oh.IsCreditableConfirmed
            , oh.IsSuspended
            , oh.IsCompleted
            , oh.IsPrinted
            , oh.IsLocked
            , oh.IsClosed
            , oh.ApplicationCode
            , oh.ApplicationId
            , oh.CreatedUserName
            , oh.CreatedDate
            , oh.LastUpdatedUserName
            , oh.LastUpdatedDate
            , oh.UserLocked
            , oh.IsCancelOrder
            , oh.IsSalesViaInternet
            , oh.CreditableConfirmedUser
            , oh.CreditableConfirmedDate
            , oh.WithHoldingTaxTypeCode
            , oh.IsProposalBased
            , ATAtt01                             = oa1.AttributeCode
            , ATAtt02                             = oa2.AttributeCode
            , OrderType                           = CAST(NULL AS NVARCHAR(30))
            , capa.CountryCode
    FROM JUPITERV3.dbo.trOrderHeader oh WITH (NOLOCK)
                        LEFT JOIN JUPITERV3.dbo.tpOrderATAttribute oa1 WITH (NOLOCK) ON oa1.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN JUPITERV3.dbo.tpOrderATAttribute oa2 WITH (NOLOCK) ON oa2.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN JUPITERV3.dbo.prCurrAccPostalAddress capa WITH (NOLOCK) ON capa.PostalAddressId = oh.ShippingPostalAddressID
                        LEFT JOIN dbo.cdWarehouse wc ON wc.Company = N'JUPITER'
                                                        AND wc.WarehouseCode = oh.WarehouseCode
  WHERE oh.CompanyCode = 1
      AND NOT EXISTS (SELECT NULL FROM dbo.AllocationExcludedWarehouse aew
                                        WHERE aew.Company = 'JUPITER'
                                            AND aew.WarehouseCode = oh.WarehouseCode)
UNION ALL
SELECT Company                     = N'NEPTUN'
            , oh.OrderHeaderId
            , oh.OrderTypeCode
            , oh.ProcessCode
            , oh.OrderNumber
            , oh.OrderDate
            , oh.OrderTime
            , oh.DocumentNumber
            , oh.PaymentTerm
            , oh.AverageDueDate
            , oh.Description
            , oh.InternalDescription
            , oh.CurrAccTypeCode
            , oh.CurrAccCode
            , oh.SubCurrAccId
            , oh.ContactId
            , oh.ShipmentMethodCode
            , oh.ShippingPostalAddressId
            , oh.BillingPostalAddressId
            , oh.GuarantorContactId
            , oh.GuarantorContactId2
            , oh.RoundsmanCode
            , oh.DeliveryCompanyCode
            , oh.TaxTypeCode
            , oh.DOVCode
            , oh.TaxExemptionCode
            , oh.CompanyCode
            , oh.OfficeCode
            , oh.StoreTypeCode
            , oh.StoreCode
            , oh.POSTerminalId
            , oh.WarehouseCode
            , oh.ToWarehouseCode
            , oh.OrdererCompanyCode
            , oh.OrdererOfficeCode
            , oh.OrdererStoreCode
            , oh.GLTypeCode
            , oh.DocCurrencyCode
            , oh.LocalCurrencyCode
            , oh.ExchangeRate
            , oh.TDisRate1
            , oh.TDisRate2
            , oh.TDisRate3
            , oh.TDisRate4
            , oh.TDisRate5
            , oh.DiscountReasonCode
            , oh.SurplusOrderQtyToleranceRate
            , oh.ImportFileNumber
            , oh.ExportFileNumber
            , oh.IncotermCode1
            , oh.IncotermCode2
            , oh.LettersOfCreditNumber
            , oh.PaymentMethodCode
            , oh.IsInclutedVat
            , oh.IsCreditSale
            , oh.IsCreditableConfirmed
            , oh.IsSuspended
            , oh.IsCompleted
            , oh.IsPrinted
            , oh.IsLocked
            , oh.IsClosed
            , oh.ApplicationCode
            , oh.ApplicationId
            , oh.CreatedUserName
            , oh.CreatedDate
            , oh.LastUpdatedUserName
            , oh.LastUpdatedDate
            , oh.UserLocked
            , oh.IsCancelOrder
            , oh.IsSalesViaInternet
            , oh.CreditableConfirmedUser
            , oh.CreditableConfirmedDate
            , oh.WithHoldingTaxTypeCode
            , oh.IsProposalBased
            , ATAtt01                             = oa1.AttributeCode
            , ATAtt02                             = oa2.AttributeCode
            , OrderType                           = CAST(NULL AS NVARCHAR(30))
            , capa.CountryCode
    FROM NEPTUNV3.dbo.trOrderHeader oh WITH (NOLOCK)
                        LEFT JOIN NEPTUNV3.dbo.tpOrderATAttribute oa1 WITH (NOLOCK) ON oa1.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN NEPTUNV3.dbo.tpOrderATAttribute oa2 WITH (NOLOCK) ON oa2.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN NEPTUNV3.dbo.prCurrAccPostalAddress capa WITH (NOLOCK) ON capa.PostalAddressId = oh.ShippingPostalAddressID
                        LEFT JOIN dbo.cdWarehouse wc ON wc.Company = N'NEPTUN'
                                                        AND wc.WarehouseCode = oh.WarehouseCode
  WHERE oh.CompanyCode = 1
      AND NOT EXISTS (SELECT NULL FROM dbo.AllocationExcludedWarehouse aew
                                        WHERE aew.Company = 'NEPTUN'
                                            AND aew.WarehouseCode = oh.WarehouseCode)
UNION ALL
SELECT Company                     = N'SATURN'
            , oh.OrderHeaderId
            , oh.OrderTypeCode
            , oh.ProcessCode
            , oh.OrderNumber
            , oh.OrderDate
            , oh.OrderTime
            , oh.DocumentNumber
            , oh.PaymentTerm
            , oh.AverageDueDate
            , oh.Description
            , oh.InternalDescription
            , oh.CurrAccTypeCode
            , oh.CurrAccCode
            , oh.SubCurrAccId
            , oh.ContactId
            , oh.ShipmentMethodCode
            , oh.ShippingPostalAddressId
            , oh.BillingPostalAddressId
            , oh.GuarantorContactId
            , oh.GuarantorContactId2
            , oh.RoundsmanCode
            , oh.DeliveryCompanyCode
            , oh.TaxTypeCode
            , oh.DOVCode
            , oh.TaxExemptionCode
            , oh.CompanyCode
            , oh.OfficeCode
            , oh.StoreTypeCode
            , oh.StoreCode
            , oh.POSTerminalId
            , oh.WarehouseCode
            , oh.ToWarehouseCode
            , oh.OrdererCompanyCode
            , oh.OrdererOfficeCode
            , oh.OrdererStoreCode
            , oh.GLTypeCode
            , oh.DocCurrencyCode
            , oh.LocalCurrencyCode
            , oh.ExchangeRate
            , oh.TDisRate1
            , oh.TDisRate2
            , oh.TDisRate3
            , oh.TDisRate4
            , oh.TDisRate5
            , oh.DiscountReasonCode
            , oh.SurplusOrderQtyToleranceRate
            , oh.ImportFileNumber
            , oh.ExportFileNumber
            , oh.IncotermCode1
            , oh.IncotermCode2
            , oh.LettersOfCreditNumber
            , oh.PaymentMethodCode
            , oh.IsInclutedVat
            , oh.IsCreditSale
            , oh.IsCreditableConfirmed
            , oh.IsSuspended
            , oh.IsCompleted
            , oh.IsPrinted
            , oh.IsLocked
            , oh.IsClosed
            , oh.ApplicationCode
            , oh.ApplicationId
            , oh.CreatedUserName
            , oh.CreatedDate
            , oh.LastUpdatedUserName
            , oh.LastUpdatedDate
            , oh.UserLocked
            , oh.IsCancelOrder
            , oh.IsSalesViaInternet
            , oh.CreditableConfirmedUser
            , oh.CreditableConfirmedDate
            , oh.WithHoldingTaxTypeCode
            , oh.IsProposalBased
            , ATAtt01                             = oa1.AttributeCode
            , ATAtt02                             = oa2.AttributeCode
            , OrderType                           = CAST(NULL AS NVARCHAR(30))
            , capa.CountryCode
    FROM SaturnV3.dbo.trOrderHeader oh WITH (NOLOCK)
                        LEFT JOIN SaturnV3.dbo.tpOrderATAttribute oa1 WITH (NOLOCK) ON oa1.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN SaturnV3.dbo.tpOrderATAttribute oa2 WITH (NOLOCK) ON oa2.OrderHeaderId = oh.OrderHeaderId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN SaturnV3.dbo.prCurrAccPostalAddress capa WITH (NOLOCK) ON capa.PostalAddressId = oh.ShippingPostalAddressID
                        LEFT JOIN dbo.cdWarehouse wc ON wc.Company = N'SATURN'
                                                        AND wc.WarehouseCode = oh.WarehouseCode
  WHERE oh.CompanyCode = 1
      AND NOT EXISTS (SELECT NULL FROM dbo.AllocationExcludedWarehouse aew
                                        WHERE aew.Company = 'SATURN'
                                            AND aew.WarehouseCode = oh.WarehouseCode);
GO

-- =========================
-- ext.OrderLine
-- =========================
CREATE VIEW ext.OrderLine
AS
SELECT Company                     = N'OLKA'
            , ol.OrderLineId
            , ol.OrderHeaderId
            , ol.OrderLineSumId
            , ol.ItemTypeCode
            , ol.ItemCode
            , ol.ColorCode
            , ol.ItemDim1Code
            , ol.ItemDim2Code
            , OrderQuantity                 = ol.Qty1
            , OpenQuantity                  = ISNULL(so.Qty1,0)
            , CancelQuantity               = ol.CancelQty1
            , ol.CancelDate
            , ol.OrderCancelReasonCode
            , ol.ClosedDate
            , ol.IsClosed
            , ol.UsedBarcode
            , ol.Price
            , ol.BaseOrderNumber
            , ols.LotCode
            , ols.LotQty
            , PurchaseOrderNo             = oa1.AttributeCode
            , ITAtt01                             = oa1.AttributeCode
            , ITAtt02                             = oa2.AttributeCode
            , ITAtt03                             = oa3.AttributeCode
            , ITAtt04                             = oa4.AttributeCode
            , ITAtt05                             = oa5.AttributeCode
            , ol.CreatedDate
            , ol.DeliveryDate
            , ol.PlannedDateOfLading
            , ol.VatRate
    FROM OlkaV3.dbo.trOrderLine ol WITH (NOLOCK)
                        LEFT JOIN OlkaV3.dbo.stOrder so WITH (NOLOCK) ON so.OrderLineId = ol.OrderLineId
                        LEFT JOIN OlkaV3.dbo.trOrderLineSum ols WITH (NOLOCK) ON ols.OrderHeaderId = ol.OrderHeaderId
                                                                          AND ols.OrderLineSumId = ol.OrderLineSumId
                        LEFT JOIN OlkaV3.dbo.tpOrderITAttribute oa1 WITH (NOLOCK) ON oa1.OrderLineId = ol.OrderLineId
                                                                                AND oa1.AttributeTypeCode = 1
                        LEFT JOIN OlkaV3.dbo.tpOrderITAttribute oa2 WITH (NOLOCK) ON oa2.OrderLineId = ol.OrderLineId
                                                                                AND oa2.AttributeTypeCode = 2
                        LEFT JOIN OlkaV3.dbo.tpOrderITAttribute oa3 WITH (NOLOCK) ON oa3.OrderLineId = ol.OrderLineId
                                                                                AND oa3.AttributeTypeCode = 3
                        LEFT JOIN OlkaV3.dbo.tpOrderITAttribute oa4 WITH (NOLOCK) ON oa4.OrderLineId = ol.OrderLineId
                                                                                AND oa4.AttributeTypeCode = 4
                        LEFT JOIN OlkaV3.dbo.tpOrderITAttribute oa5 WITH (NOLOCK) ON oa5.OrderLineId = ol.OrderLineId
                                                                                AND oa5.AttributeTypeCode = 5
UNION ALL
SELECT Company                     = N'MARLIN'
            , ol.OrderLineId
            , ol.OrderHeaderId
            , ol.OrderLineSumId
            , ol.ItemTypeCode
            , ol.ItemCode
            , ol.ColorCode
            , ol.ItemDim1Code
            , ol.ItemDim2Code
            , OrderQuantity                 = ol.Qty1
            , OpenQuantity                  = ISNULL(so.Qty1,0)
            , CancelQuantity               = ol.CancelQty1
            , ol.CancelDate
            , ol.OrderCancelReasonCode
            , ol.ClosedDate
            , ol.IsClosed
            , ol.UsedBarcode
            , ol.Price
            , ol.BaseOrderNumber
            , ols.LotCode
            , ols.LotQty
            , PurchaseOrderNo             = oa1.AttributeCode
            , ITAtt01                             = oa1.AttributeCode
            , ITAtt02                             = oa2.AttributeCode
            , ITAtt03                             = oa3.AttributeCode
            , ITAtt04                             = oa4.AttributeCode
            , ITAtt05                             = oa5.AttributeCode
            , ol.CreatedDate
            , ol.DeliveryDate
            , ol.PlannedDateOfLading
            , ol.VatRate
    FROM MARLINV3.dbo.trOrderLine ol WITH (NOLOCK)
                        LEFT JOIN MARLINV3.dbo.stOrder so WITH (NOLOCK) ON so.OrderLineId = ol.OrderLineId
                        LEFT JOIN MARLINV3.dbo.trOrderLineSum ols WITH (NOLOCK) ON ols.OrderHeaderId = ol.OrderHeaderId
                                                                              AND ols.OrderLineSumId = ol.OrderLineSumId
                        LEFT JOIN MARLINV3.dbo.tpOrderITAttribute oa1 WITH (NOLOCK) ON oa1.OrderLineId = ol.OrderLineId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN MARLINV3.dbo.tpOrderITAttribute oa2 WITH (NOLOCK) ON oa2.OrderLineId = ol.OrderLineId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN MARLINV3.dbo.tpOrderITAttribute oa3 WITH (NOLOCK) ON oa3.OrderLineId = ol.OrderLineId
                                                                                    AND oa3.AttributeTypeCode = 3
                        LEFT JOIN MARLINV3.dbo.tpOrderITAttribute oa4 WITH (NOLOCK) ON oa4.OrderLineId = ol.OrderLineId
                                                                                    AND oa4.AttributeTypeCode = 4
                        LEFT JOIN MARLINV3.dbo.tpOrderITAttribute oa5 WITH (NOLOCK) ON oa5.OrderLineId = ol.OrderLineId
                                                                                    AND oa5.AttributeTypeCode = 5
UNION ALL
SELECT Company                     = N'JUPITER'
            , ol.OrderLineId
            , ol.OrderHeaderId
            , ol.OrderLineSumId
            , ol.ItemTypeCode
            , ol.ItemCode
            , ol.ColorCode
            , ol.ItemDim1Code
            , ol.ItemDim2Code
            , OrderQuantity                 = ol.Qty1
            , OpenQuantity                  = ISNULL(so.Qty1,0)
            , CancelQuantity               = ol.CancelQty1
            , ol.CancelDate
            , ol.OrderCancelReasonCode
            , ol.ClosedDate
            , ol.IsClosed
            , ol.UsedBarcode
            , ol.Price
            , ol.BaseOrderNumber
            , ols.LotCode
            , ols.LotQty
            , PurchaseOrderNo             = oa1.AttributeCode
            , ITAtt01                             = oa1.AttributeCode
            , ITAtt02                             = oa2.AttributeCode
            , ITAtt03                             = oa3.AttributeCode
            , ITAtt04                             = oa4.AttributeCode
            , ITAtt05                             = oa5.AttributeCode
            , ol.CreatedDate
            , ol.DeliveryDate
            , ol.PlannedDateOfLading
            , ol.VatRate
    FROM JUPITERV3.dbo.trOrderLine ol WITH (NOLOCK)
                        LEFT JOIN JUPITERV3.dbo.stOrder so WITH (NOLOCK) ON so.OrderLineId = ol.OrderLineId
                        LEFT JOIN JUPITERV3.dbo.trOrderLineSum ols WITH (NOLOCK) ON ols.OrderHeaderId = ol.OrderHeaderId
                                                                              AND ols.OrderLineSumId = ol.OrderLineSumId
                        LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute oa1 WITH (NOLOCK) ON oa1.OrderLineId = ol.OrderLineId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute oa2 WITH (NOLOCK) ON oa2.OrderLineId = ol.OrderLineId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute oa3 WITH (NOLOCK) ON oa3.OrderLineId = ol.OrderLineId
                                                                                    AND oa3.AttributeTypeCode = 3
                        LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute oa4 WITH (NOLOCK) ON oa4.OrderLineId = ol.OrderLineId
                                                                                    AND oa4.AttributeTypeCode = 4
                        LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute oa5 WITH (NOLOCK) ON oa5.OrderLineId = ol.OrderLineId
                                                                                    AND oa5.AttributeTypeCode = 5
UNION ALL
SELECT Company                     = N'NEPTUN'
            , ol.OrderLineId
            , ol.OrderHeaderId
            , ol.OrderLineSumId
            , ol.ItemTypeCode
            , ol.ItemCode
            , ol.ColorCode
            , ol.ItemDim1Code
            , ol.ItemDim2Code
            , OrderQuantity                 = ol.Qty1
            , OpenQuantity                  = ISNULL(so.Qty1,0)
            , CancelQuantity               = ol.CancelQty1
            , ol.CancelDate
            , ol.OrderCancelReasonCode
            , ol.ClosedDate
            , ol.IsClosed
            , ol.UsedBarcode
            , ol.Price
            , ol.BaseOrderNumber
            , ols.LotCode
            , ols.LotQty
            , PurchaseOrderNo             = oa1.AttributeCode
            , ITAtt01                             = oa1.AttributeCode
            , ITAtt02                             = oa2.AttributeCode
            , ITAtt03                             = oa3.AttributeCode
            , ITAtt04                             = oa4.AttributeCode
            , ITAtt05                             = oa5.AttributeCode
            , ol.CreatedDate
            , ol.DeliveryDate
            , ol.PlannedDateOfLading
            , ol.VatRate
    FROM NEPTUNV3.dbo.trOrderLine ol WITH (NOLOCK)
                        LEFT JOIN NEPTUNV3.dbo.stOrder so WITH (NOLOCK) ON so.OrderLineId = ol.OrderLineId
                        LEFT JOIN NEPTUNV3.dbo.trOrderLineSum ols WITH (NOLOCK) ON ols.OrderHeaderId = ol.OrderHeaderId
                                                                              AND ols.OrderLineSumId = ol.OrderLineSumId
                        LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute oa1 WITH (NOLOCK) ON oa1.OrderLineId = ol.OrderLineId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute oa2 WITH (NOLOCK) ON oa2.OrderLineId = ol.OrderLineId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute oa3 WITH (NOLOCK) ON oa3.OrderLineId = ol.OrderLineId
                                                                                    AND oa3.AttributeTypeCode = 3
                        LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute oa4 WITH (NOLOCK) ON oa4.OrderLineId = ol.OrderLineId
                                                                                    AND oa4.AttributeTypeCode = 4
                        LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute oa5 WITH (NOLOCK) ON oa5.OrderLineId = ol.OrderLineId
                                                                                    AND oa5.AttributeTypeCode = 5
UNION ALL
SELECT Company                     = N'SATURN'
            , ol.OrderLineId
            , ol.OrderHeaderId
            , ol.OrderLineSumId
            , ol.ItemTypeCode
            , ol.ItemCode
            , ol.ColorCode
            , ol.ItemDim1Code
            , ol.ItemDim2Code
            , OrderQuantity                 = ol.Qty1
            , OpenQuantity                  = ISNULL(so.Qty1,0)
            , CancelQuantity               = ol.CancelQty1
            , ol.CancelDate
            , ol.OrderCancelReasonCode
            , ol.ClosedDate
            , ol.IsClosed
            , ol.UsedBarcode
            , ol.Price
            , ol.BaseOrderNumber
            , ols.LotCode
            , ols.LotQty
            , PurchaseOrderNo             = oa1.AttributeCode
            , ITAtt01                             = oa1.AttributeCode
            , ITAtt02                             = oa2.AttributeCode
            , ITAtt03                             = oa3.AttributeCode
            , ITAtt04                             = oa4.AttributeCode
            , ITAtt05                             = oa5.AttributeCode
            , ol.CreatedDate
            , ol.DeliveryDate
            , ol.PlannedDateOfLading
            , ol.VatRate
    FROM SaturnV3.dbo.trOrderLine ol WITH (NOLOCK)
                        LEFT JOIN SaturnV3.dbo.stOrder so WITH (NOLOCK) ON so.OrderLineId = ol.OrderLineId
                        LEFT JOIN SaturnV3.dbo.trOrderLineSum ols WITH (NOLOCK) ON ols.OrderHeaderId = ol.OrderHeaderId
                                                                              AND ols.OrderLineSumId = ol.OrderLineSumId
                        LEFT JOIN SaturnV3.dbo.tpOrderITAttribute oa1 WITH (NOLOCK) ON oa1.OrderLineId = ol.OrderLineId
                                                                                    AND oa1.AttributeTypeCode = 1
                        LEFT JOIN SaturnV3.dbo.tpOrderITAttribute oa2 WITH (NOLOCK) ON oa2.OrderLineId = ol.OrderLineId
                                                                                    AND oa2.AttributeTypeCode = 2
                        LEFT JOIN SaturnV3.dbo.tpOrderITAttribute oa3 WITH (NOLOCK) ON oa3.OrderLineId = ol.OrderLineId
                                                                                    AND oa3.AttributeTypeCode = 3
                        LEFT JOIN SaturnV3.dbo.tpOrderITAttribute oa4 WITH (NOLOCK) ON oa4.OrderLineId = ol.OrderLineId
                                                                                    AND oa4.AttributeTypeCode = 4
                        LEFT JOIN SaturnV3.dbo.tpOrderITAttribute oa5 WITH (NOLOCK) ON oa5.OrderLineId = ol.OrderLineId
                                                                                    AND oa5.AttributeTypeCode = 5;
GO

-- =========================
-- ext.ItemBarcode
-- =========================
CREATE VIEW ext.ItemBarcode
AS
SELECT Company        = N'OLKA',
       Barcode,
       BarcodeTypeCode,
       ItemTypeCode,
       ItemCode        = TRIM(ItemCode),
       ColorCode,
       ItemDim1Code,
       ItemDim2Code,
       UnitOfMeasureCode,
       Qty
  FROM OlkaV3.dbo.prItemBarcode ib WITH (NOLOCK)
 WHERE ib.ItemTypeCode = 1
   AND BarcodeTypeCode = 'EAN13'
UNION ALL
SELECT Company        = N'MARLIN',
       Barcode,
       BarcodeTypeCode,
       ItemTypeCode,
       ItemCode        = TRIM(ItemCode),
       ColorCode,
       ItemDim1Code,
       ItemDim2Code,
       UnitOfMeasureCode,
       Qty
  FROM MARLINV3.dbo.prItemBarcode ib WITH (NOLOCK)
 WHERE ib.ItemTypeCode = 1
   AND BarcodeTypeCode = 'EAN13'
UNION ALL
SELECT Company        = N'JUPITER',
       Barcode,
       BarcodeTypeCode,
       ItemTypeCode,
       ItemCode        = TRIM(ItemCode),
       ColorCode,
       ItemDim1Code,
       ItemDim2Code,
       UnitOfMeasureCode,
       Qty
  FROM JUPITERV3.dbo.prItemBarcode ib WITH (NOLOCK)
 WHERE ib.ItemTypeCode = 1
   AND BarcodeTypeCode = 'EAN13'
UNION ALL
SELECT Company        = N'NEPTUN',
       Barcode,
       BarcodeTypeCode,
       ItemTypeCode,
       ItemCode        = TRIM(ItemCode),
       ColorCode,
       ItemDim1Code,
       ItemDim2Code,
       UnitOfMeasureCode,
       Qty
  FROM NEPTUNV3.dbo.prItemBarcode ib WITH (NOLOCK)
 WHERE ib.ItemTypeCode = 1
   AND BarcodeTypeCode = 'EAN13'
UNION ALL
SELECT Company        = N'SATURN',
       Barcode,
       BarcodeTypeCode,
       ItemTypeCode,
       ItemCode        = TRIM(ItemCode),
       ColorCode,
       ItemDim1Code,
       ItemDim2Code,
       UnitOfMeasureCode,
       Qty
  FROM SaturnV3.dbo.prItemBarcode ib WITH (NOLOCK)
 WHERE ib.ItemTypeCode = 1
   AND BarcodeTypeCode = 'EAN13';
GO

-- =========================
-- ext.SubCustomer
-- =========================
CREATE VIEW ext.SubCustomer
AS
SELECT Company        = N'OLKA'
      ,sc.SubCurrAccID   AS SubCurrAccId
      ,sc.CurrAccTypeCode
      ,sc.CurrAccCode
      ,sc.SubCurrAccCode
  FROM OlkaV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
UNION ALL
SELECT Company        = N'MARLIN'
      ,sc.SubCurrAccID
      ,sc.CurrAccTypeCode
      ,sc.CurrAccCode
      ,sc.SubCurrAccCode
  FROM MARLINV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
UNION ALL
SELECT Company        = N'JUPITER'
      ,sc.SubCurrAccID
      ,sc.CurrAccTypeCode
      ,sc.CurrAccCode
      ,sc.SubCurrAccCode
  FROM JUPITERV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
UNION ALL
SELECT Company        = N'NEPTUN'
      ,sc.SubCurrAccID
      ,sc.CurrAccTypeCode
      ,sc.CurrAccCode
      ,sc.SubCurrAccCode
  FROM NEPTUNV3.dbo.prSubCurrAcc sc WITH (NOLOCK)
UNION ALL
SELECT Company        = N'SATURN'
      ,sc.SubCurrAccID
      ,sc.CurrAccTypeCode
      ,sc.CurrAccCode
      ,sc.SubCurrAccCode
  FROM SaturnV3.dbo.prSubCurrAcc sc WITH (NOLOCK);
GO

PRINT 'OrcaAlokasyon - ext view''lar olusturuldu (OrderHeader, OrderLine, ItemBarcode, SubCustomer).';
GO
