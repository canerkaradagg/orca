-- ============================================================
-- ORCA – ItemDim3Code referansı olan nesneleri bul (hata ayıklama)
-- Bu script sadece raporlama yapar; hiçbir nesneyi değiştirmez.
-- ============================================================
USE [OrcaAlokasyon]
GO

PRINT 'ItemDim3Code içeren nesneler (view, SP, function, trigger):';
SELECT OBJECT_SCHEMA_NAME(m.object_id) AS [Schema],
       OBJECT_NAME(m.object_id)        AS ObjectName,
       o.type_desc                     AS ObjectType
  FROM sys.sql_modules m
  JOIN sys.objects o ON o.object_id = m.object_id
 WHERE m.definition LIKE N'%ItemDim3Code%'
 ORDER BY ObjectName;
GO
