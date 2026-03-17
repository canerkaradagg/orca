import { useState, useMemo, useCallback, useEffect } from 'react'
import { api } from '../../lib/api-client'
import { useCompanies } from '../../hooks/useMasterData'
import styles from './CekiListesi.module.css'

// ── Types ───────────────────────────────────────────────────

const LIST_TYPE_LABELS: Record<number, string> = {
  1: 'Bayi Onayı',
  2: 'SAS Talebi',
}

interface PickingListRow {
  id: number
  listeNo: string
  tarih: string
  firma: string
  musteri: string
  durum: number
  siparisSayisi: number
  olusturan: string
  olusturmaZamani: string
  listType?: number
}

interface PickingListDetail {
  id: number
  listeNo: string
  tarih: string
  firma: string
  musteri: string
  durum: number
  listType: number
  singleWaybill: boolean
  orders: PickingOrderRow[]
  cases: PickingCaseRow[]
}

interface PickingOrderRow {
  dispOrderHeaderId: number
  dispOrderNumber: string
  dispOrderDate: string | null
  warehouseCode: string | null
  totalQty: number
  totalAmount: number
  customerSASNo: string | null
}

interface PickingCaseRow {
  dispOrderCaseId: number
  dispOrderHeaderId: number
  dispOrderNumber: string
  caseCode: string | null
  customerSASNo: string | null
}

interface ListResponse {
  ok: boolean
  rows: PickingListRow[]
  totalCount: number
}

// ── Constants ───────────────────────────────────────────────

const STATUS_OPTIONS = [
  { id: '', label: '.. Hepsi ..' },
  { id: '1', label: 'Taslak' },
  { id: '2', label: 'Onay Bekliyor' },
  { id: '3', label: 'Onaylı' },
  { id: '4', label: 'Red' },
  { id: '5', label: 'İptal' },
]

const STATUS_MAP: Record<number, { label: string; className: string }> = {
  1: { label: 'Taslak', className: 'badgeGray' },
  2: { label: 'Onay Bekliyor', className: 'badgeBlue' },
  3: { label: 'Onaylı', className: 'badgeGreen' },
  4: { label: 'Red', className: 'badgeRed' },
  5: { label: 'İptal', className: 'badgeDarkGray' },
}

const PAGE_SIZE = 20

// ── Component ───────────────────────────────────────────────

export function CekiListesi() {
  const [firma, setFirma] = useState('')
  const [musteri, setMusteri] = useState('')
  const [durum, setDurum] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [rows, setRows] = useState<PickingListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<PickingListDetail | null>(null)
  const [sasEdits, setSasEdits] = useState<Record<string, string>>({})
  const [sasSaving, setSasSaving] = useState(false)
  const [uploadCasesFile, setUploadCasesFile] = useState<File | null>(null)
  const [uploadCasesLoading, setUploadCasesLoading] = useState(false)

  // Reject modal
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)

  const { data: companiesData } = useCompanies()

  const firmaOptions = useMemo(() => {
    const base = [{ id: '', label: '.. Hepsi ..' }]
    if (!companiesData?.length) return base
    return [
      ...base,
      ...companiesData.map((c) => ({
        id: c.companyCode ?? '',
        label: c.companyName ?? c.companyCode ?? '',
      })),
    ]
  }, [companiesData])

  const fetchList = useCallback(
    async (page: number) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (firma) params.set('company', firma)
        if (musteri) params.set('customer', musteri)
        if (durum) params.set('status', durum)
        if (fromDate) params.set('fromDate', fromDate)
        if (toDate) params.set('toDate', toDate)
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))

        const res = await api.get<ListResponse>(`/api/picking-lists?${params.toString()}`)
        setRows(res.rows ?? [])
        setTotalCount(res.totalCount ?? 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Liste alınamadı.')
      } finally {
        setLoading(false)
      }
    },
    [firma, musteri, durum, fromDate, toDate],
  )

  useEffect(() => {
    fetchList(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setCurrentPage(1)
    fetchList(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchList(page)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── Actions ─────────────────────────────────────────────

  const doAction = async (id: number, action: 'send' | 'approve' | 'cancel', body?: unknown) => {
    setActionLoading(`${action}-${id}`)
    setError(null)
    try {
      const res = await api.post<{ ok: boolean; error?: string }>(`/api/picking-lists/${id}/${action}`, body)
      if (!res.ok) throw new Error(res.error || 'İşlem başarısız.')
      fetchList(currentPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem hatası.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSend = (id: number) => doAction(id, 'send')
  const handleApprove = (id: number) => doAction(id, 'approve')
  const handleCancel = (id: number) => {
    if (!confirm('Bu çeki listesini iptal etmek istediğinize emin misiniz?')) return
    doAction(id, 'cancel')
  }

  const openRejectModal = (id: number) => {
    setRejectTargetId(id)
    setRejectNote('')
    setRejectOpen(true)
  }

  const handleReject = async () => {
    if (!rejectTargetId || !rejectNote.trim()) return
    setRejectLoading(true)
    setError(null)
    try {
      const res = await api.post<{ ok: boolean; error?: string }>(
        `/api/picking-lists/${rejectTargetId}/reject`,
        { note: rejectNote.trim() },
      )
      if (!res.ok) throw new Error(res.error || 'Red işlemi başarısız.')
      setRejectOpen(false)
      fetchList(currentPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Red işlemi hatası.')
    } finally {
      setRejectLoading(false)
    }
  }

  // ── Detail ──────────────────────────────────────────────

  const openDetail = async (id: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailData(null)
    setSasEdits({})
    setUploadCasesFile(null)
    try {
      const res = await api.get<{ pickingList: Record<string, unknown>; orders: PickingOrderRow[]; cases?: PickingCaseRow[] }>(`/api/picking-lists/${id}`)
      const pl = res.pickingList
      const orders = res.orders ?? []
      const cases = res.cases ?? []
      const createdTime = pl?.CreatedTime as string | undefined
      setDetailData({
        id: (pl?.PickingListId as number) ?? id,
        listeNo: String(pl?.PickingListId ?? id),
        tarih: createdTime ? new Date(createdTime).toISOString().slice(0, 10) : '',
        firma: (pl?.Company as string) ?? '',
        musteri: (pl?.CustomerName as string) ?? (pl?.CustomerCode as string) ?? '',
        durum: (pl?.Status as number) ?? 1,
        listType: (pl?.ListType as number) ?? 1,
        singleWaybill: !!(pl?.SingleWaybill as boolean),
        orders: orders.map((o: Record<string, unknown>) => ({
          dispOrderHeaderId: o.DispOrderHeaderId as number,
          dispOrderNumber: (o.DispOrderNumber as string) ?? '',
          dispOrderDate: (o.DispOrderDate as string) ?? null,
          warehouseCode: (o.WarehouseCode as string) ?? null,
          totalQty: Number(o.TotalQty ?? 0),
          totalAmount: Number(o.TotalAmount ?? 0),
          customerSASNo: (o.CustomerSASNo as string) ?? null,
        })),
        cases: (cases as PickingCaseRow[]).map((c: Record<string, unknown>) => ({
          dispOrderCaseId: c.DispOrderCaseId as number,
          dispOrderHeaderId: c.DispOrderHeaderId as number,
          dispOrderNumber: (c.DispOrderNumber as string) ?? '',
          caseCode: (c.CaseCode as string) ?? null,
          customerSASNo: (c.CustomerSASNo as string) ?? null,
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detay alınamadı.')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailData(null)
    setSasEdits({})
  }

  const getSasValue = (key: string, current: string | null) => sasEdits[key] ?? current ?? ''

  const setSasValue = (key: string, value: string) => {
    setSasEdits(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveSas = async () => {
    if (!detailData || detailData.listType !== 2) return
    setSasSaving(true)
    setError(null)
    try {
      const singleWaybill = detailData.singleWaybill
      const items = singleWaybill
        ? detailData.orders.map(o => ({
            dispOrderHeaderId: o.dispOrderHeaderId,
            customerSASNo: getSasValue(`h-${o.dispOrderHeaderId}`, o.customerSASNo),
          }))
        : detailData.cases.map(c => ({
            dispOrderCaseId: c.dispOrderCaseId,
            customerSASNo: getSasValue(`c-${c.dispOrderCaseId}`, c.customerSASNo),
          }))
      await api.post(`/api/picking-lists/${detailData.id}/sas`, { singleWaybill, items }, { noRetry: true })
      await openDetail(detailData.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SAS kaydı başarısız.')
    } finally {
      setSasSaving(false)
    }
  }

  const handleUploadCases = async () => {
    if (!detailData || detailData.listType !== 2 || detailData.singleWaybill || !uploadCasesFile) return
    setUploadCasesLoading(true)
    setError(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await uploadCasesFile.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sh = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh)
      const body = detailData.singleWaybill
        ? { rows: rows.map(r => ({ dispOrderHeaderId: r.dispOrderHeaderId ?? r['Sevk No'], customerSASNo: String(r.customerSASNo ?? r['SAS No'] ?? '').trim() })) }
        : { rows: rows.map(r => ({ dispOrderCaseId: r.dispOrderCaseId ?? r['Koli Id'], customerSASNo: String(r.customerSASNo ?? r['SAS No'] ?? '').trim() })) }
      await api.post(`/api/picking-lists/${detailData.id}/upload-cases`, body, { noRetry: true })
      setUploadCasesFile(null)
      await openDetail(detailData.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel yükleme başarısız.')
    } finally {
      setUploadCasesLoading(false)
    }
  }

  // ── Status badge helper ─────────────────────────────────

  const renderStatus = (status: number) => {
    const info = STATUS_MAP[status]
    if (!info) return String(status)
    return <span className={styles[info.className]}>{info.label}</span>
  }

  // ── Pagination helper ───────────────────────────────────

  const paginationButtons = useMemo(() => {
    const pages: number[] = []
    const maxVisible = 7
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else if (currentPage <= 4) {
      for (let i = 1; i <= maxVisible; i++) pages.push(i)
    } else if (currentPage >= totalPages - 3) {
      for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i)
    } else {
      for (let i = currentPage - 3; i <= currentPage + 3; i++) pages.push(i)
    }
    return pages
  }, [totalPages, currentPage])

  // ── Render ──────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Çeki Listesi</h1>
        <p className={styles.subtitle}>
          Çeki listelerini filtreleyip görüntüleyebilir, onay süreçlerini yönetebilirsiniz.
        </p>
      </header>

      {/* Filter bar */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Filtreler</h2>
        <div className={styles.filterGrid}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-firma">Firma</label>
            <select
              id="filter-firma"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className={styles.selectInput}
            >
              {firmaOptions.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-musteri">Müşteri</label>
            <input
              id="filter-musteri"
              type="text"
              value={musteri}
              onChange={(e) => setMusteri(e.target.value)}
              placeholder="Müşteri adı veya kodu"
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-durum">Durum</label>
            <select
              id="filter-durum"
              value={durum}
              onChange={(e) => setDurum(e.target.value)}
              className={styles.selectInput}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-from">Başlangıç Tarihi</label>
            <input
              id="filter-from"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                if (e.target.value && toDate && e.target.value > toDate) setToDate(e.target.value)
              }}
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-to">Bitiş Tarihi</label>
            <input
              id="filter-to"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRowSorgula}>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className={styles.sorgulaButton}
            >
              {loading ? 'Yükleniyor…' : 'Sorgula'}
            </button>
          </div>
        </div>
      </section>

      {/* Main grid */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Çeki Listeleri</h2>
        {loading && <p className={styles.loadingText}>Yükleniyor…</p>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.tableWrap}>
          <table className={styles.gridTable}>
            <thead>
              <tr>
                <th>Liste No</th>
                <th>Tarih</th>
                <th>Firma</th>
                <th>Müşteri</th>
                <th>Liste Tipi</th>
                <th>Durum</th>
                <th>Sipariş Sayısı</th>
                <th>Oluşturan</th>
                <th>Oluşturma Zamanı</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyCell}>
                    {loading ? '' : 'Kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={styles.clickableRow}
                    onClick={() => openDetail(row.id)}
                  >
                    <td>{row.listeNo}</td>
                    <td>{row.tarih}</td>
                    <td>{row.firma}</td>
                    <td>{row.musteri}</td>
                    <td>{LIST_TYPE_LABELS[row.listType ?? 1] ?? '—'}</td>
                    <td>{renderStatus(row.durum)}</td>
                    <td className={styles.numericCell}>{row.siparisSayisi}</td>
                    <td>{row.olusturan}</td>
                    <td>{row.olusturmaZamani}</td>
                    <td className={styles.actionCell} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionCellWrap}>
                        {row.durum === 1 && (
                          <>
                            <button
                              type="button"
                              className={styles.btnSend}
                              onClick={() => handleSend(row.id)}
                              disabled={actionLoading === `send-${row.id}`}
                            >
                              {actionLoading === `send-${row.id}` ? '…' : 'Gönder'}
                            </button>
                            <button
                              type="button"
                              className={styles.btnCancel}
                              onClick={() => handleCancel(row.id)}
                              disabled={!!actionLoading}
                            >
                              İptal
                            </button>
                          </>
                        )}
                        {row.durum === 2 && (
                          <>
                            <button
                              type="button"
                              className={styles.btnApprove}
                              onClick={() => handleApprove(row.id)}
                              disabled={actionLoading === `approve-${row.id}`}
                            >
                              {actionLoading === `approve-${row.id}` ? '…' : 'Onayla'}
                            </button>
                            <button
                              type="button"
                              className={styles.btnReject}
                              onClick={() => openRejectModal(row.id)}
                              disabled={!!actionLoading}
                            >
                              Reddet
                            </button>
                            <button
                              type="button"
                              className={styles.btnCancel}
                              onClick={() => handleCancel(row.id)}
                              disabled={!!actionLoading}
                            >
                              İptal
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Sayfa {currentPage} / {totalPages} ({totalCount} kayıt)
          </span>
          <div className={styles.paginationButtons}>
            <button type="button" className={styles.pageBtn} onClick={() => handlePageChange(1)} disabled={currentPage <= 1} aria-label="İlk sayfa">«</button>
            <button type="button" className={styles.pageBtn} onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} aria-label="Önceki">‹</button>
            {paginationButtons.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.pageBtn} ${currentPage === p ? styles.pageBtnActive : ''}`}
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            ))}
            <button type="button" className={styles.pageBtn} onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Sonraki">›</button>
            <button type="button" className={styles.pageBtn} onClick={() => handlePageChange(totalPages)} disabled={currentPage >= totalPages} aria-label="Son sayfa">»</button>
          </div>
        </div>
      </section>

      {/* Detail modal */}
      {detailOpen && (
        <div className={styles.modalOverlay} onClick={closeDetail} role="presentation">
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="detail-title" className={styles.modalTitle}>
                Çeki Listesi Detayı {detailData ? `– ${detailData.listeNo}` : ''}
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeDetail} aria-label="Kapat">×</button>
            </div>
            {detailLoading && <p className={styles.loadingText} style={{ padding: '1rem 1.25rem' }}>Yükleniyor…</p>}
            {detailData && (
              <>
                <div className={styles.detailSummary}>
                  <div><strong>Liste No:</strong> {detailData.listeNo}</div>
                  <div><strong>Tarih:</strong> {detailData.tarih}</div>
                  <div><strong>Firma:</strong> {detailData.firma}</div>
                  <div><strong>Müşteri:</strong> {detailData.musteri}</div>
                  <div><strong>Liste Tipi:</strong> {LIST_TYPE_LABELS[detailData.listType] ?? '—'}</div>
                  {detailData.listType === 2 && <div><strong>Tek İrsaliye:</strong> {detailData.singleWaybill ? 'Evet' : 'Hayır'}</div>}
                  <div><strong>Durum:</strong> {renderStatus(detailData.durum)}</div>
                </div>
                <div className={styles.modalTableWrap}>
                  <table className={styles.modalTable}>
                    <thead>
                      <tr>
                        <th>Sevk No</th>
                        <th>Tarih</th>
                        <th>Depo</th>
                        <th className={styles.numericCell}>Adet</th>
                        <th className={styles.numericCell}>Tutar</th>
                        {detailData.listType === 2 && detailData.singleWaybill && <th>SAS No</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.orders.length === 0 ? (
                        <tr>
                          <td colSpan={detailData.listType === 2 && detailData.singleWaybill ? 6 : 5} className={styles.emptyCell}>Sevk emri bulunamadı.</td>
                        </tr>
                      ) : (
                        detailData.orders.map((o) => (
                          <tr key={o.dispOrderHeaderId}>
                            <td>{o.dispOrderNumber}</td>
                            <td>{o.dispOrderDate ? new Date(o.dispOrderDate).toLocaleDateString('tr-TR') : '—'}</td>
                            <td>{o.warehouseCode ?? '—'}</td>
                            <td className={styles.numericCell}>{o.totalQty.toLocaleString('tr-TR')}</td>
                            <td className={styles.numericCell}>{o.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            {detailData.listType === 2 && detailData.singleWaybill && (
                              <td>
                                <input
                                  type="text"
                                  className={styles.sasInput}
                                  value={getSasValue(`h-${o.dispOrderHeaderId}`, o.customerSASNo)}
                                  onChange={e => setSasValue(`h-${o.dispOrderHeaderId}`, e.target.value)}
                                  placeholder="SAS no"
                                />
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {detailData.listType === 2 && !detailData.singleWaybill && detailData.cases.length > 0 && (
                  <>
                    <h3 className={styles.detailSubTitle}>Koliler – SAS No</h3>
                    <div className={styles.modalTableWrap}>
                      <table className={styles.modalTable}>
                        <thead>
                          <tr>
                            <th>Sevk No</th>
                            <th>Koli Kodu</th>
                            <th>SAS No</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.cases.map((c) => (
                            <tr key={c.dispOrderCaseId}>
                              <td>{c.dispOrderNumber}</td>
                              <td>{c.caseCode ?? '—'}</td>
                              <td>
                                <input
                                  type="text"
                                  className={styles.sasInput}
                                  value={getSasValue(`c-${c.dispOrderCaseId}`, c.customerSASNo)}
                                  onChange={e => setSasValue(`c-${c.dispOrderCaseId}`, e.target.value)}
                                  placeholder="SAS no"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {detailData.listType === 2 && (
                  <div className={styles.sasActions}>
                    <button
                      type="button"
                      className={styles.modalBtnPrimary}
                      onClick={handleSaveSas}
                      disabled={sasSaving}
                    >
                      {sasSaving ? 'Kaydediliyor…' : 'SAS Kaydet'}
                    </button>
                    {!detailData.singleWaybill && (
                      <div className={styles.uploadCasesWrap}>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={e => setUploadCasesFile(e.target.files?.[0] ?? null)}
                          className={styles.fileInput}
                        />
                        <button
                          type="button"
                          className={styles.modalBtnSecondary}
                          onClick={handleUploadCases}
                          disabled={!uploadCasesFile || uploadCasesLoading}
                        >
                          {uploadCasesLoading ? 'Yükleniyor…' : 'Excel ile SAS Yükle'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className={styles.modalFooter}>
                  <button type="button" className={styles.modalBtnPrimary} onClick={closeDetail}>Kapat</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectOpen && (
        <div className={styles.modalOverlay} onClick={() => setRejectOpen(false)} role="presentation">
          <div
            className={`${styles.modalContent} ${styles.modalSmall}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="reject-title" className={styles.modalTitle}>Red Notu</h2>
              <button type="button" className={styles.modalClose} onClick={() => setRejectOpen(false)} aria-label="Kapat">×</button>
            </div>
            <div className={styles.rejectBody}>
              <label className={styles.formLabel} htmlFor="reject-note">Red gerekçenizi yazınız:</label>
              <textarea
                id="reject-note"
                className={styles.rejectTextarea}
                rows={4}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Red nedeninizi buraya yazınız…"
              />
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalBtnSecondary}
                onClick={() => setRejectOpen(false)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={styles.btnReject}
                onClick={handleReject}
                disabled={rejectLoading || !rejectNote.trim()}
              >
                {rejectLoading ? 'Gönderiliyor…' : 'Reddet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
