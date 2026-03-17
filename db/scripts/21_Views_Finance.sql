-- ============================================================
-- ORCA – Finance ext views (linked server)
-- ERP V3 veritabanlarindan cari, sevk emri, fatura bilgisi
-- PERFORMANS: Tum linked server sorgulari WITH (NOLOCK)
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== ext.Customer ====================
-- Union'da sadece OlkaV3'ten okunuyor
IF OBJECT_ID('ext.Customer', 'V') IS NOT NULL DROP VIEW ext.Customer;
GO
CREATE VIEW ext.Customer AS
SELECT Company             = N'OLKA'
      ,CurrAccTypeCode   = ca.CurrAccTypeCode
      ,CurrAccCode       = ca.CurrAccCode
      ,CurrAccDescription = ISNULL(cad.CurrAccDescription, ca.CurrAccCode)
      ,FinancialApproval = IIF(ca.CurrAccTypeCode = 5, CAST(0 AS BIT), ISNULL(TRY_CAST(pa5.AttributeCode AS BIT), CAST(0 AS BIT)))
      ,CustomerApproval  = IIF(ca.CurrAccTypeCode = 5, CAST(0 AS BIT), ISNULL(TRY_CAST(pa7.AttributeCode AS BIT), CAST(0 AS BIT)))
      ,SASRequest        = IIF(ca.CurrAccTypeCode = 5, CAST(0 AS BIT), ISNULL(TRY_CAST(pa6.AttributeCode AS BIT), CAST(0 AS BIT)))
      ,Contract          = IIF(pa20.AttributeCode IS NULL, N'Yok', pa20.AttributeCode)
      ,SingleWaybill     = ISNULL(TRY_CAST(pa8.AttributeCode AS BIT), CAST(0 AS BIT))
      ,SASControl        = ISNULL(TRY_CAST(pa9.AttributeCode AS BIT), CAST(0 AS BIT))
      ,ShipmentApproval  = ISNULL(TRY_CAST(pa10.AttributeCode AS BIT), CAST(0 AS BIT))
      ,IsBlocked         = ISNULL(ca.IsBlocked, CAST(0 AS BIT))
  FROM OlkaV3.dbo.cdCurrAcc ca WITH (NOLOCK)
  LEFT JOIN OlkaV3.dbo.cdCurrAccDesc cad WITH (NOLOCK) ON cad.CurrAccTypeCode = ca.CurrAccTypeCode AND cad.CurrAccCode = ca.CurrAccCode AND cad.LangCode = N'TR'
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa5  WITH (NOLOCK) ON pa5.CurrAccTypeCode  = ca.CurrAccTypeCode AND pa5.CurrAccCode  = ca.CurrAccCode AND pa5.AttributeTypeCode  = 5
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa6  WITH (NOLOCK) ON pa6.CurrAccTypeCode  = ca.CurrAccTypeCode AND pa6.CurrAccCode  = ca.CurrAccCode AND pa6.AttributeTypeCode  = 6
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa7  WITH (NOLOCK) ON pa7.CurrAccTypeCode  = ca.CurrAccTypeCode AND pa7.CurrAccCode  = ca.CurrAccCode AND pa7.AttributeTypeCode  = 7
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa8  WITH (NOLOCK) ON pa8.CurrAccTypeCode  = ca.CurrAccTypeCode AND pa8.CurrAccCode  = ca.CurrAccCode AND pa8.AttributeTypeCode  = 8
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa9  WITH (NOLOCK) ON pa9.CurrAccTypeCode  = ca.CurrAccTypeCode AND pa9.CurrAccCode  = ca.CurrAccCode AND pa9.AttributeTypeCode  = 9
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa10 WITH (NOLOCK) ON pa10.CurrAccTypeCode = ca.CurrAccTypeCode AND pa10.CurrAccCode = ca.CurrAccCode AND pa10.AttributeTypeCode = 10
  LEFT JOIN OlkaV3.dbo.prCurrAccAttribute pa20 WITH (NOLOCK) ON pa20.CurrAccTypeCode = ca.CurrAccTypeCode AND pa20.CurrAccCode = ca.CurrAccCode AND pa20.AttributeTypeCode = 20
 WHERE ca.CurrAccTypeCode IN (3, 5)
   AND ca.CompanyCode = 1;
GO

-- ==================== ext.DispOrderHeader ====================
IF OBJECT_ID('ext.DispOrderHeader', 'V') IS NOT NULL DROP VIEW ext.DispOrderHeader;
GO
CREATE VIEW ext.DispOrderHeader AS
SELECT Company              = N'OLKA'
      ,DispOrderHeaderId    = doh.DispOrderHeaderId
      ,ProcessCode          = doh.ProcessCode
      ,DispOrderNumber      = doh.DispOrderNumber
      ,DispOrderDate        = doh.DispOrderDate
      ,CurrAccTypeCode      = doh.CurrAccTypeCode
      ,CurrAccCode          = doh.CurrAccCode
      ,SubCurrAccId         = doh.SubCurrAccId
      ,WarehouseCode        = doh.WarehouseCode
      ,IsReturn             = doh.IsReturn
      ,CreatedDate          = doh.CreatedDate
      ,DispOrderTime        = doh.CreatedDate
  FROM OlkaV3.dbo.trDispOrderHeader doh WITH (NOLOCK)
 WHERE doh.CompanyCode = 1 AND doh.IsCompleted = 1
UNION ALL
SELECT N'MARLIN', doh.DispOrderHeaderId, doh.ProcessCode, doh.DispOrderNumber, doh.DispOrderDate,
       doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, doh.WarehouseCode, doh.IsReturn, doh.CreatedDate, doh.CreatedDate
  FROM MARLINV3.dbo.trDispOrderHeader doh WITH (NOLOCK)
 WHERE doh.CompanyCode = 1 AND doh.IsCompleted = 1
UNION ALL
SELECT N'JUPITER', doh.DispOrderHeaderId, doh.ProcessCode, doh.DispOrderNumber, doh.DispOrderDate,
       doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, doh.WarehouseCode, doh.IsReturn, doh.CreatedDate, doh.CreatedDate
  FROM JUPITERV3.dbo.trDispOrderHeader doh WITH (NOLOCK)
 WHERE doh.CompanyCode = 1 AND doh.IsCompleted = 1
UNION ALL
SELECT N'NEPTUN', doh.DispOrderHeaderId, doh.ProcessCode, doh.DispOrderNumber, doh.DispOrderDate,
       doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, doh.WarehouseCode, doh.IsReturn, doh.CreatedDate, doh.CreatedDate
  FROM NEPTUNV3.dbo.trDispOrderHeader doh WITH (NOLOCK)
 WHERE doh.CompanyCode = 1 AND doh.IsCompleted = 1
UNION ALL
SELECT N'SATURN', doh.DispOrderHeaderId, doh.ProcessCode, doh.DispOrderNumber, doh.DispOrderDate,
       doh.CurrAccTypeCode, doh.CurrAccCode, doh.SubCurrAccId, doh.WarehouseCode, doh.IsReturn, doh.CreatedDate, doh.CreatedDate
  FROM SaturnV3.dbo.trDispOrderHeader doh WITH (NOLOCK)
 WHERE doh.CompanyCode = 1 AND doh.IsCompleted = 1;
GO

-- ==================== ext.DispOrderLine ====================
IF OBJECT_ID('ext.DispOrderLine', 'V') IS NOT NULL DROP VIEW ext.DispOrderLine;
GO
CREATE VIEW ext.DispOrderLine AS
SELECT Company           = N'OLKA'
      ,DispOrderLineId   = dol.DispOrderLineId
      ,DispOrderHeaderId = dol.DispOrderHeaderId
      ,ItemCode          = ol.ItemCode
      ,ColorCode         = ol.ColorCode
      ,ItemDim1Code      = ol.ItemDim1Code
      ,ItemDim2Code      = ol.ItemDim2Code
      ,Qty1              = dol.Qty1
      ,UsedBarcode       = dol.UsedBarcode
      ,OrderLineId       = dol.OrderLineId
      ,ReserveLineId     = dol.ReserveLineId
      ,ITAtt01 = ita1.AttributeCode
      ,ITAtt02 = ita2.AttributeCode
      ,ITAtt03 = ita3.AttributeCode
      ,ITAtt04 = ita4.AttributeCode
      ,ITAtt05 = ita5.AttributeCode
  FROM OlkaV3.dbo.trDispOrderLine dol WITH (NOLOCK)
  LEFT JOIN OlkaV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  LEFT JOIN OlkaV3.dbo.tpOrderITAttribute ita1 WITH (NOLOCK) ON ita1.OrderLineId = dol.DispOrderLineId AND ita1.AttributeTypeCode = 1
  LEFT JOIN OlkaV3.dbo.tpOrderITAttribute ita2 WITH (NOLOCK) ON ita2.OrderLineId = dol.DispOrderLineId AND ita2.AttributeTypeCode = 2
  LEFT JOIN OlkaV3.dbo.tpOrderITAttribute ita3 WITH (NOLOCK) ON ita3.OrderLineId = dol.DispOrderLineId AND ita3.AttributeTypeCode = 3
  LEFT JOIN OlkaV3.dbo.tpOrderITAttribute ita4 WITH (NOLOCK) ON ita4.OrderLineId = dol.DispOrderLineId AND ita4.AttributeTypeCode = 4
  LEFT JOIN OlkaV3.dbo.tpOrderITAttribute ita5 WITH (NOLOCK) ON ita5.OrderLineId = dol.DispOrderLineId AND ita5.AttributeTypeCode = 5
UNION ALL
SELECT N'MARLIN', dol.DispOrderLineId, dol.DispOrderHeaderId, ol.ItemCode, ol.ColorCode, ol.ItemDim1Code, ol.ItemDim2Code,
       dol.Qty1, dol.UsedBarcode, dol.OrderLineId, dol.ReserveLineId,
       ita1.AttributeCode, ita2.AttributeCode, ita3.AttributeCode, ita4.AttributeCode, ita5.AttributeCode
  FROM MARLINV3.dbo.trDispOrderLine dol WITH (NOLOCK)
  LEFT JOIN MARLINV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  LEFT JOIN MARLINV3.dbo.tpOrderITAttribute ita1 WITH (NOLOCK) ON ita1.OrderLineId = dol.DispOrderLineId AND ita1.AttributeTypeCode = 1
  LEFT JOIN MARLINV3.dbo.tpOrderITAttribute ita2 WITH (NOLOCK) ON ita2.OrderLineId = dol.DispOrderLineId AND ita2.AttributeTypeCode = 2
  LEFT JOIN MARLINV3.dbo.tpOrderITAttribute ita3 WITH (NOLOCK) ON ita3.OrderLineId = dol.DispOrderLineId AND ita3.AttributeTypeCode = 3
  LEFT JOIN MARLINV3.dbo.tpOrderITAttribute ita4 WITH (NOLOCK) ON ita4.OrderLineId = dol.DispOrderLineId AND ita4.AttributeTypeCode = 4
  LEFT JOIN MARLINV3.dbo.tpOrderITAttribute ita5 WITH (NOLOCK) ON ita5.OrderLineId = dol.DispOrderLineId AND ita5.AttributeTypeCode = 5
UNION ALL
SELECT N'JUPITER', dol.DispOrderLineId, dol.DispOrderHeaderId, ol.ItemCode, ol.ColorCode, ol.ItemDim1Code, ol.ItemDim2Code,
       dol.Qty1, dol.UsedBarcode, dol.OrderLineId, dol.ReserveLineId,
       ita1.AttributeCode, ita2.AttributeCode, ita3.AttributeCode, ita4.AttributeCode, ita5.AttributeCode
  FROM JUPITERV3.dbo.trDispOrderLine dol WITH (NOLOCK)
  LEFT JOIN JUPITERV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute ita1 WITH (NOLOCK) ON ita1.OrderLineId = dol.DispOrderLineId AND ita1.AttributeTypeCode = 1
  LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute ita2 WITH (NOLOCK) ON ita2.OrderLineId = dol.DispOrderLineId AND ita2.AttributeTypeCode = 2
  LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute ita3 WITH (NOLOCK) ON ita3.OrderLineId = dol.DispOrderLineId AND ita3.AttributeTypeCode = 3
  LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute ita4 WITH (NOLOCK) ON ita4.OrderLineId = dol.DispOrderLineId AND ita4.AttributeTypeCode = 4
  LEFT JOIN JUPITERV3.dbo.tpOrderITAttribute ita5 WITH (NOLOCK) ON ita5.OrderLineId = dol.DispOrderLineId AND ita5.AttributeTypeCode = 5
UNION ALL
SELECT N'NEPTUN', dol.DispOrderLineId, dol.DispOrderHeaderId, ol.ItemCode, ol.ColorCode, ol.ItemDim1Code, ol.ItemDim2Code,
       dol.Qty1, dol.UsedBarcode, dol.OrderLineId, dol.ReserveLineId,
       ita1.AttributeCode, ita2.AttributeCode, ita3.AttributeCode, ita4.AttributeCode, ita5.AttributeCode
  FROM NEPTUNV3.dbo.trDispOrderLine dol WITH (NOLOCK)
  LEFT JOIN NEPTUNV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute ita1 WITH (NOLOCK) ON ita1.OrderLineId = dol.DispOrderLineId AND ita1.AttributeTypeCode = 1
  LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute ita2 WITH (NOLOCK) ON ita2.OrderLineId = dol.DispOrderLineId AND ita2.AttributeTypeCode = 2
  LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute ita3 WITH (NOLOCK) ON ita3.OrderLineId = dol.DispOrderLineId AND ita3.AttributeTypeCode = 3
  LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute ita4 WITH (NOLOCK) ON ita4.OrderLineId = dol.DispOrderLineId AND ita4.AttributeTypeCode = 4
  LEFT JOIN NEPTUNV3.dbo.tpOrderITAttribute ita5 WITH (NOLOCK) ON ita5.OrderLineId = dol.DispOrderLineId AND ita5.AttributeTypeCode = 5
UNION ALL
SELECT N'SATURN', dol.DispOrderLineId, dol.DispOrderHeaderId, ol.ItemCode, ol.ColorCode, ol.ItemDim1Code, ol.ItemDim2Code,
       dol.Qty1, dol.UsedBarcode, dol.OrderLineId, dol.ReserveLineId,
       ita1.AttributeCode, ita2.AttributeCode, ita3.AttributeCode, ita4.AttributeCode, ita5.AttributeCode
  FROM SaturnV3.dbo.trDispOrderLine dol WITH (NOLOCK)
  LEFT JOIN SaturnV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  LEFT JOIN SaturnV3.dbo.tpOrderITAttribute ita1 WITH (NOLOCK) ON ita1.OrderLineId = dol.DispOrderLineId AND ita1.AttributeTypeCode = 1
  LEFT JOIN SaturnV3.dbo.tpOrderITAttribute ita2 WITH (NOLOCK) ON ita2.OrderLineId = dol.DispOrderLineId AND ita2.AttributeTypeCode = 2
  LEFT JOIN SaturnV3.dbo.tpOrderITAttribute ita3 WITH (NOLOCK) ON ita3.OrderLineId = dol.DispOrderLineId AND ita3.AttributeTypeCode = 3
  LEFT JOIN SaturnV3.dbo.tpOrderITAttribute ita4 WITH (NOLOCK) ON ita4.OrderLineId = dol.DispOrderLineId AND ita4.AttributeTypeCode = 4
  LEFT JOIN SaturnV3.dbo.tpOrderITAttribute ita5 WITH (NOLOCK) ON ita5.OrderLineId = dol.DispOrderLineId AND ita5.AttributeTypeCode = 5;
GO

-- ==================== ext.Season ====================
IF OBJECT_ID('ext.Season', 'V') IS NOT NULL DROP VIEW ext.Season;
GO
CREATE VIEW ext.Season AS
SELECT Company = N'OLKA', SeasonCode = cdSeason.SeasonCode, SeasonDescription = cdSeasonDesc.SeasonDescription
  FROM OlkaV3.dbo.cdSeason WITH (NOLOCK)
  INNER JOIN OlkaV3.dbo.cdSeasonDesc WITH (NOLOCK) ON cdSeason.SeasonCode = cdSeasonDesc.SeasonCode AND cdSeasonDesc.LangCode = N'TR'
 WHERE cdSeason.IsBlocked = 0
   AND cdSeason.StartDate > DATEADD(MONTH, -12, GETDATE())
   AND cdSeason.EndDate < DATEADD(MONTH, 12, GETDATE())
UNION ALL
SELECT Company = N'MARLIN', SeasonCode = cdSeason.SeasonCode, SeasonDescription = cdSeasonDesc.SeasonDescription
  FROM MARLINV3.dbo.cdSeason WITH (NOLOCK)
  INNER JOIN MARLINV3.dbo.cdSeasonDesc WITH (NOLOCK) ON cdSeason.SeasonCode = cdSeasonDesc.SeasonCode AND cdSeasonDesc.LangCode = N'TR'
 WHERE cdSeason.IsBlocked = 0
   AND cdSeason.StartDate > DATEADD(MONTH, -12, GETDATE())
   AND cdSeason.EndDate < DATEADD(MONTH, 12, GETDATE())
UNION ALL
SELECT Company = N'JUPITER', SeasonCode = cdSeason.SeasonCode, SeasonDescription = cdSeasonDesc.SeasonDescription
  FROM JUPITERV3.dbo.cdSeason WITH (NOLOCK)
  INNER JOIN JUPITERV3.dbo.cdSeasonDesc WITH (NOLOCK) ON cdSeason.SeasonCode = cdSeasonDesc.SeasonCode AND cdSeasonDesc.LangCode = N'TR'
 WHERE cdSeason.IsBlocked = 0
   AND cdSeason.StartDate > DATEADD(MONTH, -12, GETDATE())
   AND cdSeason.EndDate < DATEADD(MONTH, 12, GETDATE())
UNION ALL
SELECT Company = N'NEPTUN', SeasonCode = cdSeason.SeasonCode, SeasonDescription = cdSeasonDesc.SeasonDescription
  FROM NEPTUNV3.dbo.cdSeason WITH (NOLOCK)
  INNER JOIN NEPTUNV3.dbo.cdSeasonDesc WITH (NOLOCK) ON cdSeason.SeasonCode = cdSeasonDesc.SeasonCode AND cdSeasonDesc.LangCode = N'TR'
 WHERE cdSeason.IsBlocked = 0
   AND cdSeason.StartDate > DATEADD(MONTH, -12, GETDATE())
   AND cdSeason.EndDate < DATEADD(MONTH, 12, GETDATE())
UNION ALL
SELECT Company = N'SATURN', SeasonCode = cdSeason.SeasonCode, SeasonDescription = cdSeasonDesc.SeasonDescription
  FROM SaturnV3.dbo.cdSeason WITH (NOLOCK)
  INNER JOIN SaturnV3.dbo.cdSeasonDesc WITH (NOLOCK) ON cdSeason.SeasonCode = cdSeasonDesc.SeasonCode AND cdSeasonDesc.LangCode = N'TR'
 WHERE cdSeason.IsBlocked = 0
   AND cdSeason.StartDate > DATEADD(MONTH, -12, GETDATE())
   AND cdSeason.EndDate < DATEADD(MONTH, 12, GETDATE());
GO

-- ==================== ext.OrderLinePrice ====================
-- Union UpdateDispOrderLinePrice için: trDispOrderLine + trOrderLine'dan fiyat bilgisi
IF OBJECT_ID('ext.OrderLinePrice', 'V') IS NOT NULL DROP VIEW ext.OrderLinePrice;
GO
CREATE VIEW ext.OrderLinePrice AS
SELECT Company, DispOrderLineId, OrderLineId, BaseListPrice, ListPrice, VatRate, Markup
  FROM (
    SELECT Company = N'OLKA', dol.DispOrderLineId, dol.OrderLineId
          ,BaseListPrice = ol.Price
          ,ListPrice = ol.Price / NULLIF(1 + (ISNULL(ol.VatRate, 0) / 100), 0)
          ,VatRate = ISNULL(ol.VatRate, 0) / 100
          ,Markup = ISNULL(ol.LDisRate1, 0) / 100
      FROM OlkaV3.dbo.trDispOrderLine dol WITH (NOLOCK)
      JOIN OlkaV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
    UNION ALL
    SELECT N'MARLIN', dol.DispOrderLineId, dol.OrderLineId, ol.Price, ol.Price / NULLIF(1 + (ISNULL(ol.VatRate, 0) / 100), 0), ISNULL(ol.VatRate, 0) / 100, ISNULL(ol.LDisRate1, 0) / 100
      FROM MARLINV3.dbo.trDispOrderLine dol WITH (NOLOCK)
      JOIN MARLINV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
    UNION ALL
    SELECT N'JUPITER', dol.DispOrderLineId, dol.OrderLineId, ol.Price, ol.Price / NULLIF(1 + (ISNULL(ol.VatRate, 0) / 100), 0), ISNULL(ol.VatRate, 0) / 100, ISNULL(ol.LDisRate1, 0) / 100
      FROM JUPITERV3.dbo.trDispOrderLine dol WITH (NOLOCK)
      JOIN JUPITERV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
    UNION ALL
    SELECT N'NEPTUN', dol.DispOrderLineId, dol.OrderLineId, ol.Price, ol.Price / NULLIF(1 + (ISNULL(ol.VatRate, 0) / 100), 0), ISNULL(ol.VatRate, 0) / 100, ISNULL(ol.LDisRate1, 0) / 100
      FROM NEPTUNV3.dbo.trDispOrderLine dol WITH (NOLOCK)
      JOIN NEPTUNV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
    UNION ALL
    SELECT N'SATURN', dol.DispOrderLineId, dol.OrderLineId, ol.Price, ol.Price / NULLIF(1 + (ISNULL(ol.VatRate, 0) / 100), 0), ISNULL(ol.VatRate, 0) / 100, ISNULL(ol.LDisRate1, 0) / 100
      FROM SaturnV3.dbo.trDispOrderLine dol WITH (NOLOCK)
      JOIN SaturnV3.dbo.trOrderLine ol WITH (NOLOCK) ON ol.OrderLineId = dol.OrderLineId
  ) o;
GO

PRINT 'Finance ext views oluşturuldu.';
GO
