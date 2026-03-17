import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api } from '../../lib/api-client'
import { useCompanies } from '../../hooks/useMasterData'
import styles from './SevkEmriRaporu.module.css'

// ── Types ───────────────────────────────────────────────────

interface ReportRow {
  sevkNo: string
  tarih: string
  cariKodu: string
  cariAdi: string
  depo: string
  finansOnay: string
  finansTalepTarihi: string
  finansOnayTarihi: string
  finansSure: number | null
  finansDurum: string
  bayiTalepTarihi: string
  bayiOnayTarihi: string
  bayiSure: number | null
  bayiDurum: string
  sasTalepTarihi: string
  sasOnayTarihi: string
  sasSure: number | null
  sasDurum: string
  adet: number
  sevkAdet: number
  durum: string
  beklemeNedeni: string
  sezon: string
  marka: string
}

interface ReportResponse {
  ok: boolean
  rows: ReportRow[]
  totalCount: number
}

const PAGE_SIZE = 100

// ── Component ───────────────────────────────────────────────

export function SevkEmriRaporu() {
  const [firma, setFirma] = useState('')
  const [musteri, setMusteri] = useState('*')
  const [sezon, setSezon] = useState('')
  const [asnNo, setAsnNo] = useState('')
  const [sevkNo, setSevkNo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tableRef = useRef<HTMLDivElement>(null)
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

  const fetchReport = useCallback(
    async (page: number) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (firma) params.set('company', firma)
        params.set('customer', musteri || '*')
        if (sezon) params.set('season', sezon)
        if (asnNo) params.set('asnNo', asnNo)
        if (sevkNo) params.set('sevkNo', sevkNo)
        params.set('page', String(page))
        params.set('pageSize', String(PAGE_SIZE))

        const res = await api.get<ReportResponse>(`/api/reports/disp-order-process?${params.toString()}`)
        setRows(res.rows ?? [])
        setTotalCount(res.totalCount ?? 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rapor verisi alınamadı.')
      } finally {
        setLoading(false)
      }
    },
    [firma, musteri, sezon, asnNo, sevkNo],
  )

  useEffect(() => {
    fetchReport(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setCurrentPage(1)
    fetchReport(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchReport(page)
    tableRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── Duration badge ──────────────────────────────────────

  const renderDuration = (hours: number | null) => {
    if (hours == null || hours < 0) return '—'
    let cls = styles.durationGreen
    if (hours >= 72) cls = styles.durationRed
    else if (hours >= 24) cls = styles.durationYellow
    return <span className={cls}>{hours}s</span>
  }

  // ── CSV export ──────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (rows.length === 0) return

    const headers = [
      'Sevk No', 'Tarih', 'Cari Kodu', 'Cari Adı', 'Depo',
      'Finans Onay', 'Finans Talep Tarihi', 'Finans Onay Tarihi', 'Finans Süre', 'Finans Durum',
      'Bayi Talep Tarihi', 'Bayi Onay Tarihi', 'Bayi Süre', 'Bayi Durum',
      'SAS Talep Tarihi', 'SAS Onay Tarihi', 'SAS Süre', 'SAS Durum',
      'Adet', 'Sevk Adet',
      'Durum', 'Bekleme Nedeni', 'Sezon', 'Marka',
    ]

    const csvRows = rows.map((r) => [
      r.sevkNo, r.tarih, r.cariKodu, r.cariAdi, r.depo,
      r.finansOnay, r.finansTalepTarihi, r.finansOnayTarihi, r.finansSure ?? '', r.finansDurum,
      r.bayiTalepTarihi, r.bayiOnayTarihi, r.bayiSure ?? '', r.bayiDurum,
      r.sasTalepTarihi, r.sasOnayTarihi, r.sasSure ?? '', r.sasDurum,
      r.adet, r.sevkAdet,
      r.durum, r.beklemeNedeni, r.sezon, r.marka,
    ])

    const escape = (val: unknown) => {
      const s = String(val ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const bom = '\uFEFF'
    const csv = bom + [headers.map(escape).join(','), ...csvRows.map((r) => r.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SevkEmriRaporu_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [rows])

  // ── Pagination buttons ──────────────────────────────────

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
        <h1>Sevk Emri Raporu</h1>
        <p className={styles.subtitle}>
          Sevk emirlerinin süreç durumlarını takip edebilir ve raporlayabilirsiniz.
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
              placeholder="* (tümü)"
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-sezon">Sezon</label>
            <input
              id="filter-sezon"
              type="text"
              value={sezon}
              onChange={(e) => setSezon(e.target.value)}
              placeholder="Sezon kodu"
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-asn">ASN No</label>
            <input
              id="filter-asn"
              type="text"
              value={asnNo}
              onChange={(e) => setAsnNo(e.target.value)}
              placeholder="ASN numarası"
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-sevk">Sevk No</label>
            <input
              id="filter-sevk"
              type="text"
              value={sevkNo}
              onChange={(e) => setSevkNo(e.target.value)}
              placeholder="Sevk numarası"
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRowActions}>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className={styles.sorgulaButton}
            >
              {loading ? 'Yükleniyor…' : 'Sorgula'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={rows.length === 0}
              className={styles.exportButton}
              title="Excel'e aktar (CSV)"
            >
              Excel İndir
            </button>
          </div>
        </div>
      </section>

      {/* Report grid */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>Rapor Sonuçları</h2>
          <span className={styles.resultCount}>{totalCount} kayıt</span>
        </div>
        {loading && <p className={styles.loadingText}>Yükleniyor…</p>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.tableWrap} ref={tableRef}>
          <table className={styles.reportTable}>
            <thead>
              {/* Group header row */}
              <tr className={styles.groupHeaderRow}>
                <th colSpan={5} className={styles.groupTemel}>Temel</th>
                <th colSpan={5} className={styles.groupFinans}>Finans</th>
                <th colSpan={4} className={styles.groupBayi}>Bayi</th>
                <th colSpan={4} className={styles.groupSas}>SAS</th>
                <th colSpan={2} className={styles.groupMiktar}>Miktar</th>
                <th colSpan={4} className={styles.groupDiger}>Diğer</th>
              </tr>
              {/* Column header row */}
              <tr className={styles.columnHeaderRow}>
                {/* Temel */}
                <th className={styles.thTemel}>Sevk No</th>
                <th className={styles.thTemel}>Tarih</th>
                <th className={styles.thTemel}>Cari Kodu</th>
                <th className={styles.thTemel}>Cari Adı</th>
                <th className={styles.thTemel}>Depo</th>
                {/* Finans */}
                <th className={styles.thFinans}>Onay</th>
                <th className={styles.thFinans}>Talep Tarihi</th>
                <th className={styles.thFinans}>Onay Tarihi</th>
                <th className={styles.thFinans}>Süre</th>
                <th className={styles.thFinans}>Durum</th>
                {/* Bayi */}
                <th className={styles.thBayi}>Talep Tarihi</th>
                <th className={styles.thBayi}>Onay Tarihi</th>
                <th className={styles.thBayi}>Süre</th>
                <th className={styles.thBayi}>Durum</th>
                {/* SAS */}
                <th className={styles.thSas}>Talep Tarihi</th>
                <th className={styles.thSas}>Onay Tarihi</th>
                <th className={styles.thSas}>Süre</th>
                <th className={styles.thSas}>Durum</th>
                {/* Miktar */}
                <th className={styles.thMiktar}>Adet</th>
                <th className={styles.thMiktar}>Sevk Adet</th>
                {/* Diğer */}
                <th className={styles.thDiger}>Durum</th>
                <th className={styles.thDiger}>Bekleme Nedeni</th>
                <th className={styles.thDiger}>Sezon</th>
                <th className={styles.thDiger}>Marka</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={24} className={styles.emptyCell}>
                    {loading ? '' : 'Kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.sevkNo}-${idx}`}>
                    <td>{r.sevkNo}</td>
                    <td className={styles.nowrap}>{r.tarih}</td>
                    <td>{r.cariKodu}</td>
                    <td>{r.cariAdi}</td>
                    <td>{r.depo}</td>
                    <td>{r.finansOnay}</td>
                    <td className={styles.nowrap}>{r.finansTalepTarihi}</td>
                    <td className={styles.nowrap}>{r.finansOnayTarihi}</td>
                    <td>{renderDuration(r.finansSure)}</td>
                    <td>{r.finansDurum}</td>
                    <td className={styles.nowrap}>{r.bayiTalepTarihi}</td>
                    <td className={styles.nowrap}>{r.bayiOnayTarihi}</td>
                    <td>{renderDuration(r.bayiSure)}</td>
                    <td>{r.bayiDurum}</td>
                    <td className={styles.nowrap}>{r.sasTalepTarihi}</td>
                    <td className={styles.nowrap}>{r.sasOnayTarihi}</td>
                    <td>{renderDuration(r.sasSure)}</td>
                    <td>{r.sasDurum}</td>
                    <td className={styles.numericCell}>{r.adet}</td>
                    <td className={styles.numericCell}>{r.sevkAdet}</td>
                    <td>{r.durum}</td>
                    <td>{r.beklemeNedeni}</td>
                    <td>{r.sezon}</td>
                    <td>{r.marka}</td>
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
    </div>
  )
}
