import { useState, useCallback, useMemo } from 'react'
import { api } from '../../lib/api-client'
import { useCompanies } from '../../hooks/useMasterData'
import styles from './CekiListesiOlustur.module.css'

/* ── Types ── */

interface DispOrder {
  dispOrderHeaderId: number
  dispOrderNo: string
  orderDate: string
  warehouseName: string
  totalAmount: number
  totalQty: number
}

const LIST_TYPES = [
  { id: 1, label: 'Bayi Onayı' },
  { id: 2, label: 'SAS Talebi' },
] as const

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('tr-TR')
}

function fmtMoney(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CekiListesiOlustur() {
  const { data: companiesData } = useCompanies()
  const companies = useMemo(() => Array.isArray(companiesData) ? companiesData : [], [companiesData])

  const [company, setCompany] = useState('')
  const [customer, setCustomer] = useState('')
  const [listType, setListType] = useState(1)
  const [singleWaybill, setSingleWaybill] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [rows, setRows] = useState<DispOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  /* ── Fetch available orders ── */

  const fetchOrders = useCallback(async () => {
    if (!company) { setError('Firma seçiniz.'); return }
    setLoading(true)
    setError('')
    setSuccess('')
    setSelectedIds(new Set())
    try {
      const params = new URLSearchParams({ company, customer, listType: String(listType) })
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      const data = await api.get<{ rows?: Record<string, unknown>[] }>(`/api/picking-lists/disp-orders?${params}`)
      const raw = Array.isArray(data) ? data : (data?.rows ?? [])
      setRows(raw.map((r: Record<string, unknown>) => ({
        dispOrderHeaderId: r.DispOrderHeaderId as number,
        dispOrderNo: (r.DispOrderNumber as string) ?? '',
        orderDate: (r.DispOrderDate as string) ?? '',
        warehouseName: (r.WarehouseCode as string) ?? '',
        totalAmount: Number(r.TotalAmount ?? 0),
        totalQty: Number(r.TotalQty ?? 0),
      })))
    } catch (e: any) {
      setError(e.message || 'Veri alınamadı.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [company, customer, listType, fromDate, toDate])

  /* ── Selection ── */

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelectedIds(new Set(rows.map(r => r.dispOrderHeaderId))), [rows])
  const deselectAll = useCallback(() => setSelectedIds(new Set()), [])

  const allSelected = rows.length > 0 && selectedIds.size === rows.length

  const summary = useMemo(() => {
    const selected = rows.filter(r => selectedIds.has(r.dispOrderHeaderId))
    return {
      count: selected.length,
      totalAmount: selected.reduce((s, r) => s + r.totalAmount, 0),
    }
  }, [rows, selectedIds])

  /* ── Save ── */

  const handleSave = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.post('/api/picking-lists', {
        company,
        customerCode: customer,
        listType,
        singleWaybill,
        dispOrderIds: Array.from(selectedIds),
      }, { noRetry: true })
      setSuccess('Çeki listesi başarıyla oluşturuldu.')
      setSelectedIds(new Set())
      fetchOrders()
    } catch (e: any) {
      setError(e.message || 'Kayıt başarısız.')
    } finally {
      setSaving(false)
    }
  }, [selectedIds, company, customer, listType, singleWaybill, fetchOrders])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Çeki Listesi Oluştur</h1>
        <p className={styles.subtitle}>Sevk emirlerinden çeki listesi oluşturun.</p>
      </div>

      {/* Filter bar */}
      <div className={styles.section}>
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Firma</label>
            <select
              className={styles.filterSelect}
              value={company}
              onChange={e => setCompany(e.target.value)}
            >
              <option value="">Seçiniz...</option>
              {companies.map(c => (
                <option key={c.companyCode ?? ''} value={c.companyCode ?? ''}>{c.companyName ?? c.companyCode ?? ''}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Cari Kodu</label>
            <input
              type="text"
              className={styles.filterInput}
              placeholder="Cari kodu girin..."
              value={customer}
              onChange={e => setCustomer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchOrders()}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Liste Tipi</label>
            <div className={styles.radioGroup}>
              {LIST_TYPES.map(lt => (
                <label key={lt.id} className={styles.radioItem}>
                  <input
                    type="radio"
                    name="listType"
                    value={lt.id}
                    checked={listType === lt.id}
                    onChange={() => setListType(lt.id)}
                  />
                  {lt.label}
                </label>
              ))}
            </div>
          </div>

          {listType === 2 && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Tek İrsaliye</label>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={singleWaybill}
                  onChange={e => setSingleWaybill(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
                <span className={styles.toggleText}>{singleWaybill ? 'Evet' : 'Hayır'}</span>
              </label>
            </div>
          )}

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Sevk Tarihi (Başlangıç)</label>
            <input
              type="date"
              className={styles.filterInput}
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Sevk Tarihi (Bitiş)</label>
            <input
              type="date"
              className={styles.filterInput}
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
          </div>

          <div className={styles.filterGroup} style={{ alignSelf: 'flex-end' }}>
            <button className={styles.searchBtn} onClick={fetchOrders} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : null}
              Sorgula
            </button>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}
      {success && <div className={styles.successMsg}>{success}</div>}

      {/* Grid */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Sevk Emirleri {rows.length > 0 && <span className={styles.countBadge}>{rows.length}</span>}
          </span>
          {rows.length > 0 && (
            <div className={styles.bulkActions}>
              <button className={styles.btnSmall} onClick={selectAll} disabled={allSelected}>Tümünü Seç</button>
              <button className={styles.btnSmall} onClick={deselectAll} disabled={selectedIds.size === 0}>Seçimi Kaldır</button>
            </div>
          )}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thCheck}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => allSelected ? deselectAll() : selectAll()}
                    disabled={rows.length === 0}
                  />
                </th>
                <th>Sevk No</th>
                <th>Tarih</th>
                <th>Depo</th>
                <th className={styles.thRight}>Tutar</th>
                <th className={styles.thRight}>Adet</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className={styles.emptyCell}><span className={styles.spinner} /> Yükleniyor...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyCell}>Kayıt bulunamadı.</td></tr>
              ) : (
                rows.map(row => (
                  <tr
                    key={row.dispOrderHeaderId}
                    className={selectedIds.has(row.dispOrderHeaderId) ? styles.rowSelected : ''}
                    onClick={() => toggleSelect(row.dispOrderHeaderId)}
                  >
                    <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.dispOrderHeaderId)}
                        onChange={() => toggleSelect(row.dispOrderHeaderId)}
                      />
                    </td>
                    <td className={styles.cellBold}>{row.dispOrderNo}</td>
                    <td>{fmtDate(row.orderDate)}</td>
                    <td>{row.warehouseName}</td>
                    <td className={styles.tdRight}>{fmtMoney(row.totalAmount)}</td>
                    <td className={styles.tdRight}>{row.totalQty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer + Save */}
      {rows.length > 0 && (
        <div className={styles.footer}>
          <div className={styles.footerSummary}>
            <span className={styles.footerItem}>
              <strong>Seçili:</strong> {summary.count} sipariş
            </span>
            <span className={styles.footerItem}>
              <strong>Toplam Tutar:</strong> {fmtMoney(summary.totalAmount)}
            </span>
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || selectedIds.size === 0}
          >
            {saving ? <span className={styles.spinner} /> : null}
            Çeki Listesi Oluştur
          </button>
        </div>
      )}
    </div>
  )
}
