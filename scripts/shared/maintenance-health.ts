/**
 * ORCA bakım sağlık kontrolü – eşik tabanlı kontrol ve isteğe bağlı bakım
 */

import type { ConnectionPool } from 'mssql'

const TABLE_LIST = ['Inbound', 'InboundAsn', 'InboundAsnLine', 'Request', 'ReceivedOrder', 'DraftOrderHeader', 'DraftOrderLine', 'DraftOrderLot', 'Queue', 'QueueLog', 'QueueLogDetail']
const STATS_TABLES = ['Queue', 'Request', 'InboundAsn', 'DraftOrderHeader', 'QueueLog', 'Inbound', 'DraftOrderLine', 'QueueLogDetail']

interface Thresholds {
  tableRowWarning: number
  fragmentationPercent: number
  statisticsStaleDays: number
  runFixWhenNeeded: boolean
}

export async function getThresholds(sqlPool: ConnectionPool): Promise<Thresholds> {
  const defaults: Thresholds = {
    tableRowWarning: 500000,
    fragmentationPercent: 15,
    statisticsStaleDays: 7,
    runFixWhenNeeded: true,
  }
  try {
    const r = await sqlPool.request().query(`
      SELECT ParameterKey, ParameterValue FROM dbo.SystemParameter
      WHERE ParameterKey IN (N'MaintenanceTableRowWarning', N'MaintenanceFragmentationPercent', N'MaintenanceStatisticsStaleDays', N'MaintenanceRunFixWhenNeeded')
    `)
    const rows = r.recordset || []
    for (const row of rows) {
      const v = row.ParameterValue != null ? String(row.ParameterValue).trim() : ''
      const n = parseInt(v, 10)
      switch (row.ParameterKey) {
        case 'MaintenanceTableRowWarning':
          if (!isNaN(n) && n >= 0) defaults.tableRowWarning = n
          break
        case 'MaintenanceFragmentationPercent':
          if (!isNaN(n) && n >= 0 && n <= 100) defaults.fragmentationPercent = n
          break
        case 'MaintenanceStatisticsStaleDays':
          if (!isNaN(n) && n >= 0) defaults.statisticsStaleDays = n
          break
        case 'MaintenanceRunFixWhenNeeded':
          defaults.runFixWhenNeeded = v === '1' || v.toLowerCase() === 'true'
          break
      }
    }
  } catch (_) {}
  return defaults
}

interface HealthCheckResult {
  reportLines: string[]
  recommendations: string[]
  actionsTaken: string[]
  thresholds: Thresholds
}

export async function runHealthCheck(sqlPool: ConnectionPool, options: { runMaintenance?: boolean } = {}): Promise<HealthCheckResult> {
  const { runMaintenance = false } = options
  const reportLines: string[] = []
  const recommendations: string[] = []
  const actionsTaken: string[] = []
  const thresholds = await getThresholds(sqlPool)
  const doFix = runMaintenance && thresholds.runFixWhenNeeded

  reportLines.push('--- Eşikler ---')
  reportLines.push(`Tablo satır uyarı: ${thresholds.tableRowWarning} | Fragmantasyon: >%${thresholds.fragmentationPercent} | İstatistik eski: ${thresholds.statisticsStaleDays} gün | Eşik aşımında bakım: ${thresholds.runFixWhenNeeded ? 'Açık' : 'Kapalı'}`)
  reportLines.push('--- Tablo satır sayıları ---')
  for (const t of TABLE_LIST) {
    try {
      const r = await sqlPool.request().query(`SELECT COUNT(*) AS cnt FROM dbo.[${t}]`)
      const cnt = Number((r.recordset as Record<string, { cnt: number }>[])?.[0]?.cnt ?? 0)
      reportLines.push(`${t}: ${cnt}`)
      if (thresholds.tableRowWarning > 0 && cnt >= thresholds.tableRowWarning) {
        recommendations.push(`Yedekleme/arşiv önerisi: ${t} (${cnt} satır, eşik: ${thresholds.tableRowWarning})`)
      }
    } catch (e) {
      reportLines.push(`${t}: (hata: ${(e as Error).message})`)
    }
  }
  reportLines.push('')

  const fragThreshold = Math.max(1, thresholds.fragmentationPercent)
  reportLines.push(`--- Index fragmantasyonu (eşik >%${fragThreshold}, sayfa >100) ---`)
  try {
    const r = await sqlPool.request().query(`
      SELECT OBJECT_SCHEMA_NAME(ips.object_id) AS sch, OBJECT_NAME(ips.object_id) AS TableName, i.name AS IndexName,
             ips.index_id, ips.avg_fragmentation_in_percent, ips.page_count
      FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
      INNER JOIN sys.indexes i ON i.object_id = ips.object_id AND i.index_id = ips.index_id
      WHERE ips.avg_fragmentation_in_percent > ${fragThreshold} AND ips.page_count > 100 AND i.name IS NOT NULL
      ORDER BY ips.avg_fragmentation_in_percent DESC
    `)
    const fragRows = r.recordset || []
    if (fragRows.length === 0) reportLines.push('Eşik üzeri fragmantasyon yok.')
    else {
      for (const row of fragRows) {
        const rw = row as Record<string, unknown>
        const pct = Number(rw.avg_fragmentation_in_percent).toFixed(1)
        reportLines.push(`  ${rw.TableName}.${rw.IndexName}: ${pct}% (${rw.page_count} sayfa)`)
        if (doFix) {
          try {
            const schema = (rw.sch as string) || 'dbo'
            const tableName = rw.TableName as string
            const indexName = rw.IndexName as string
            const useRebuild = Number(rw.avg_fragmentation_in_percent) > 30
            const cmd = useRebuild
              ? `ALTER INDEX [${indexName}] ON [${schema}].[${tableName}] REBUILD`
              : `ALTER INDEX [${indexName}] ON [${schema}].[${tableName}] REORGANIZE`
            await sqlPool.request().query(cmd)
            actionsTaken.push(`${tableName}.${indexName}: ${useRebuild ? 'REBUILD' : 'REORGANIZE'} uygulandı`)
          } catch (e) {
            recommendations.push(`Fragmantasyon düzeltme hatası ${rw.TableName}.${rw.IndexName}: ${(e as Error).message}`)
          }
        } else {
          recommendations.push(`Fragmantasyon: ${rw.TableName}.${rw.IndexName} ${pct}% – REBUILD/REORGANIZE önerilir`)
        }
      }
    }
  } catch (e) {
    reportLines.push(`Hata: ${(e as Error).message}`)
  }
  reportLines.push('')

  reportLines.push('--- Eksik index önerisi (OrcaAlokasyon, ilk 5) ---')
  try {
    const r = await sqlPool.request().query(`
      SELECT TOP 5 mid.statement, migs.avg_user_impact, migs.user_seeks
      FROM sys.dm_db_missing_index_details mid
      INNER JOIN sys.dm_db_missing_index_groups mig ON mig.index_handle = mid.index_handle
      INNER JOIN sys.dm_db_missing_index_group_stats migs ON migs.group_handle = mig.index_group_handle
      WHERE mid.database_id = DB_ID()
      ORDER BY migs.avg_user_impact DESC
    `)
    const rows = r.recordset || []
    if (rows.length === 0) reportLines.push('Öneri yok.')
    else rows.forEach((row: Record<string, unknown>) => reportLines.push(`  ${row.statement} (impact: ${row.avg_user_impact}, seeks: ${row.user_seeks})`))
  } catch (e) {
    reportLines.push(`Hata: ${(e as Error).message}`)
  }
  reportLines.push('')

  reportLines.push('--- Kullanılmayan index (inceleme önerisi) ---')
  try {
    const r = await sqlPool.request().query(`
      SELECT OBJECT_SCHEMA_NAME(i.object_id) AS sch, OBJECT_NAME(i.object_id) AS TableName, i.name AS IndexName
      FROM sys.indexes i
      LEFT JOIN sys.dm_db_index_usage_stats u ON u.database_id = DB_ID() AND u.object_id = i.object_id AND u.index_id = i.index_id
      WHERE i.object_id > 255 AND i.index_id > 0 AND i.name IS NOT NULL
        AND (u.user_seeks + u.user_scans + u.user_lookups) = 0
        AND i.is_primary_key = 0 AND i.is_unique_constraint = 0
      ORDER BY OBJECT_NAME(i.object_id), i.name
    `)
    const rows = r.recordset || []
    if (rows.length === 0) reportLines.push('Şu an kullanılmayan index önerisi yok (DMV son yeniden başlatmadan beri).')
    else {
      (rows as Record<string, unknown>[]).slice(0, 15).forEach((row: Record<string, unknown>) => {
        reportLines.push(`  ${row.TableName}.${row.IndexName}`)
        recommendations.push(`Kullanılmayan index incele: ${row.TableName}.${row.IndexName} – gerek yoksa DROP adayı`)
      })
      if (rows.length > 15) reportLines.push(`  ... ve ${rows.length - 15} adet daha`)
    }
  } catch (e) {
    reportLines.push(`Hata: ${(e as Error).message}`)
  }
  reportLines.push('')

  reportLines.push('--- İstatistik yaşı (eşik: ' + thresholds.statisticsStaleDays + ' gün) ---')
  const staleCutoff = new Date()
  staleCutoff.setDate(staleCutoff.getDate() - Math.max(0, thresholds.statisticsStaleDays))
  const tablesToUpdateStats: string[] = []
  for (const t of STATS_TABLES) {
    try {
      const r = await sqlPool.request().query(`
        SELECT MAX(STATS_DATE(s.object_id, s.stats_id)) AS lastUpdated
        FROM sys.stats s
        INNER JOIN sys.objects o ON o.object_id = s.object_id
        WHERE o.name = N'${t.replace(/'/g, "''")}' AND o.schema_id = SCHEMA_ID('dbo')
      `)
      const lastUpdated = (r.recordset as Record<string, Date>[])?.[0]?.lastUpdated
      const isStale = !lastUpdated || new Date(lastUpdated) < staleCutoff
      reportLines.push(`  ${t}: ${lastUpdated ? new Date(lastUpdated).toISOString().slice(0, 10) : 'yok'} ${isStale ? '(eski – güncelleme önerilir)' : ''}`)
      if (isStale) tablesToUpdateStats.push(t)
    } catch (e) {
      reportLines.push(`  ${t}: ${(e as Error).message}`)
    }
  }
  if (doFix && tablesToUpdateStats.length > 0) {
    for (const t of tablesToUpdateStats) {
      try {
        await sqlPool.request().query(`UPDATE STATISTICS dbo.[${t}] WITH FULLSCAN`)
        actionsTaken.push(`İstatistik güncellendi: ${t}`)
      } catch (e) {
        recommendations.push(`İstatistik güncelleme hatası ${t}: ${(e as Error).message}`)
      }
    }
  } else if (tablesToUpdateStats.length > 0) {
    recommendations.push(`Eski istatistik: ${tablesToUpdateStats.join(', ')} – UPDATE STATISTICS önerilir`)
  }
  reportLines.push('')

  reportLines.push('--- View ve SP ---')
  try {
    const r = await sqlPool.request().query(`
      SELECT type_desc, COUNT(*) AS cnt FROM sys.objects
      WHERE type IN ('V','P') AND is_ms_shipped = 0
      GROUP BY type_desc
    `)
    const rows = r.recordset || []
    if (rows.length === 0) reportLines.push('View/SP yok.')
    else (rows as Record<string, unknown>[]).forEach((row: Record<string, unknown>) => reportLines.push(`  ${row.type_desc}: ${row.cnt} adet`))
    reportLines.push('  Öneri: Indexe uygun olmayan join veya ağır sorgular için Execution plan ile kontrol edin.')
  } catch (e) {
    reportLines.push(`Hata: ${(e as Error).message}`)
  }

  return { reportLines, recommendations, actionsTaken, thresholds }
}
