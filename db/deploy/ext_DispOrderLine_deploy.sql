-- ============================================================
-- ORCA – ext.DispOrderLine view deploy
-- trOrderLine LEFT JOIN ile ItemCode, ColorCode, ItemDim1Code, ItemDim2Code
-- SSMS veya sqlcmd ile OrcaAlokasyon üzerinde çalıştırın.
-- ============================================================

USE [OrcaAlokasyon]
GO

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

PRINT 'ext.DispOrderLine view deploy tamamlandı.';
GO
