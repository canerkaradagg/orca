/**
 * ORCA bakım raporu – paylaşılan mantık (agent ve API)
 */

import nodemailer from 'nodemailer'
import { runHealthCheck } from './maintenance-health'
import type { ConnectionPool } from 'mssql'

export async function getReportEmail(sqlPool: ConnectionPool): Promise<string> {
  try {
    const r = await sqlPool.request().query("SELECT ParameterValue FROM dbo.SystemParameter WHERE ParameterKey = N'MaintenanceReportEmail'")
    const v = (r.recordset as Record<string, unknown>[])?.[0]?.ParameterValue
    if (v != null && String(v).trim()) return String(v).trim()
  } catch (_) {}
  return 'caner.karadag@olka.com.tr'
}

export async function runMaintenanceReport(sqlPool: ConnectionPool): Promise<string> {
  const lines: string[] = []
  const now = new Date().toISOString()
  lines.push('ORCA Bakım Raporu (eşik tabanlı kontrol)')
  lines.push(now)
  lines.push('')

  try {
    const { reportLines, recommendations, actionsTaken } = await runHealthCheck(sqlPool, {
      runMaintenance: true,
    })
    lines.push(...reportLines)
    if (recommendations.length > 0) {
      lines.push('')
      lines.push('--- Öneriler ---')
      recommendations.forEach(rec => lines.push('  ' + rec))
    }
    if (actionsTaken.length > 0) {
      lines.push('')
      lines.push('--- Bu çalıştırmada yapılan işlemler ---')
      actionsTaken.forEach(act => lines.push('  ' + act))
    }
  } catch (err) {
    lines.push('Genel hata: ' + ((err as Error).message || String(err)))
  }

  return lines.join('\n')
}

export async function sendReportByEmail(to: string, reportText: string): Promise<{ sent: boolean; error?: string }> {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT || 587
  const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user || 'orca@localhost'

  if (!host || !user || !pass) {
    return { sent: false, error: 'SMTP_HOST, SMTP_USER, SMTP_PASS tanımlı değil' }
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(String(port), 10) || 587,
    secure,
    auth: { user, pass },
  })

  try {
    const dateStr = new Date().toISOString().slice(0, 10)
    await transporter.sendMail({
      from,
      to,
      subject: `ORCA Bakım Raporu ${dateStr}`,
      text: reportText,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
