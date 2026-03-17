import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import styles from './AsnListele.module.css'
import { api } from '../lib/api-client'
import { useDebounce } from '../hooks/useDebounce'
import { useCompanies, useWarehouses, useVendors, useAsnList, useInboundLines } from '../hooks/useMasterData'
import { IconDocument, IconOnayla, IconAlokasyon, IconSuccessCircle } from './AsnListeleIcons'
import {
  ISLEMI_YAPAN_OPTIONS,
  DURUM_OPTIONS,
  EVET_HAYIR_OPTIONS,
  GRID_COLUMNS,
  PAGE_SIZE,
  EXCEL_PREVIEW_PAGE_SIZE,
  EXCEL_PREVIEW_HEADERS,
} from './AsnListeleConstants'
import type { AsnRow, InsufficientBarcodeRow, ExcelPreviewData } from './AsnListele/types'


export function AsnListele() {
  const [firma, setFirma] = useState('')
  const [depo, setDepo] = useState('')
  const [satici, setSatici] = useState('')
  const { data: companiesData } = useCompanies()
  const companyForOptions = firma || (companiesData?.[0]?.companyCode ?? '')
  const { data: warehousesData } = useWarehouses(companyForOptions)
  const { data: vendorsData } = useVendors(companyForOptions)
  const FIRMA_OPTIONS = useMemo(() => {
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
  const [islemZamaniBaslangic, setIslemZamaniBaslangic] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [islemZamaniBitis, setIslemZamaniBitis] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [islemiYapan, setIslemiYapan] = useState('')
  const [durum, setDurum] = useState('')
  const [gridFilters, setGridFilters] = useState<Record<string, string>>({})
  const debouncedGridFilters = useDebounce(gridFilters, 500)
  const [currentPage, setCurrentPage] = useState(1)

  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false)
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false)
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [vendorSearch, setVendorSearch] = useState('')
  const [warehousePage, setWarehousePage] = useState(1)
  const [vendorPage, setVendorPage] = useState(1)
  const warehouseDropdownRef = useRef<HTMLDivElement>(null)
  const vendorDropdownRef = useRef<HTMLDivElement>(null)
  const warehouseSearchInputRef = useRef<HTMLInputElement>(null)
  const vendorSearchInputRef = useRef<HTMLInputElement>(null)
  const SEARCHABLE_PAGE_SIZE = 15

  const [appliedFilters, setAppliedFilters] = useState<{
    firma: string
    depo: string
    satici: string
    baslangic: string
    bitis: string
    islemiYapan: string
    durum: string
  } | null>(null)
  const queryClient = useQueryClient()
  const { data: asnListData, isLoading: listLoading, isError: listIsError, error: listErrorObj } = useAsnList(
    appliedFilters
      ? { ...appliedFilters, page: currentPage, pageSize: PAGE_SIZE }
      : {
          firma,
          depo,
          satici,
          baslangic: islemZamaniBaslangic ? `${islemZamaniBaslangic} 00:00:00` : '',
          bitis: islemZamaniBitis ? `${islemZamaniBitis} 23:59:59` : '',
          islemiYapan,
          durum,
          page: currentPage,
          pageSize: PAGE_SIZE,
        },
    { enabled: true }
  )
  const listRows: AsnRow[] = asnListData?.rows ?? []
  const [listError, setListError] = useState<string | null>(listIsError ? (listErrorObj as Error)?.message ?? 'Liste alınamadı.' : null)
  const [onaylaLoadingId, setOnaylaLoadingId] = useState<string | null>(null)
  const [showInsufficientBarcodesModal, setShowInsufficientBarcodesModal] = useState(false)
  const [, setInsufficientBarcodes] = useState<string[]>([])
  const [insufficientBarcodesDetail, setInsufficientBarcodesDetail] = useState<InsufficientBarcodeRow[]>([])
  const [insufficientModalPage, setInsufficientModalPage] = useState(1)
  const [expandedInsufficientRow, setExpandedInsufficientRow] = useState<Set<string>>(new Set())
  const INSUFFICIENT_PAGE_SIZE = 10

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!warehouseDropdownOpen) return
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target as Node)) {
        setWarehouseDropdownOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [warehouseDropdownOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!vendorDropdownOpen) return
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(e.target as Node)) {
        setVendorDropdownOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [vendorDropdownOpen])

  useEffect(() => {
    if (warehouseDropdownOpen) {
      setWarehouseSearch('')
      setWarehousePage(1)
      setTimeout(() => warehouseSearchInputRef.current?.focus(), 50)
    }
  }, [warehouseDropdownOpen])

  useEffect(() => {
    if (vendorDropdownOpen) {
      setVendorSearch('')
      setVendorPage(1)
      setTimeout(() => vendorSearchInputRef.current?.focus(), 50)
    }
  }, [vendorDropdownOpen])

  const warehouseSearchLower = warehouseSearch.trim().toLowerCase()
  const warehouseFiltered = warehouseSearchLower
    ? (warehousesData ?? []).filter(
        (w) =>
          (w.code && w.code.toLowerCase().includes(warehouseSearchLower)) ||
          (w.description && w.description.toLowerCase().includes(warehouseSearchLower))
      )
    : warehousesData ?? []
  const warehouseTotal = warehouseFiltered.length
  const warehouseTotalPages = Math.max(1, Math.ceil(warehouseTotal / SEARCHABLE_PAGE_SIZE))
  const warehousePageStart = (Math.min(warehousePage, warehouseTotalPages) - 1) * SEARCHABLE_PAGE_SIZE
  const warehousePageOptions = warehouseFiltered.slice(warehousePageStart, warehousePageStart + SEARCHABLE_PAGE_SIZE)
  useEffect(() => {
    setWarehousePage((p) => (warehouseSearchLower ? 1 : Math.min(p, Math.max(1, warehouseTotalPages))))
  }, [warehouseSearchLower, warehouseTotalPages])

  const vendorSearchLower = vendorSearch.trim().toLowerCase()
  const vendorFiltered = vendorSearchLower
    ? (vendorsData ?? []).filter(
        (v) =>
          (v.code && v.code.toLowerCase().includes(vendorSearchLower)) ||
          (v.description && v.description.toLowerCase().includes(vendorSearchLower))
      )
    : vendorsData ?? []
  const vendorTotal = vendorFiltered.length
  const vendorTotalPages = Math.max(1, Math.ceil(vendorTotal / SEARCHABLE_PAGE_SIZE))
  const vendorPageStart = (Math.min(vendorPage, vendorTotalPages) - 1) * SEARCHABLE_PAGE_SIZE
  const vendorPageOptions = vendorFiltered.slice(vendorPageStart, vendorPageStart + SEARCHABLE_PAGE_SIZE)
  useEffect(() => {
    setVendorPage((p) => (vendorSearchLower ? 1 : Math.min(p, Math.max(1, vendorTotalPages))))
  }, [vendorSearchLower, vendorTotalPages])

  const selectedWarehouse = warehousesData?.find((w) => w.code === depo)
  const selectedWarehouseLabel = selectedWarehouse
    ? (selectedWarehouse.description ? `${selectedWarehouse.code} – ${selectedWarehouse.description}` : selectedWarehouse.code)
    : ''
  const selectedVendor = vendorsData?.find((v) => v.code === satici)
  const selectedVendorLabel = selectedVendor
    ? (selectedVendor.description ? `${selectedVendor.code} – ${selectedVendor.description}` : selectedVendor.code)
    : ''

  const getCurrentFilters = useCallback(
    () => ({
      firma,
      depo,
      satici,
      baslangic: islemZamaniBaslangic ? `${islemZamaniBaslangic} 00:00:00` : '',
      bitis: islemZamaniBitis ? `${islemZamaniBitis} 23:59:59` : '',
      islemiYapan,
      durum,
    }),
    [firma, depo, satici, islemZamaniBaslangic, islemZamaniBitis, islemiYapan, durum]
  )

  const handleSorgula = useCallback(() => {
    setAppliedFilters(getCurrentFilters())
    setCurrentPage(1)
  }, [getCurrentFilters])

  useEffect(() => {
    setAppliedFilters(getCurrentFilters())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- Sadece mount’ta çalışır

  const [alokasyonInfoModalOpen, setAlokasyonInfoModalOpen] = useState(false)
  const [excelModalOpen, setExcelModalOpen] = useState(false)
  const [selectedRowForExcel, setSelectedRowForExcel] = useState<AsnRow | null>(null)
  const [excelPreviewPage, setExcelPreviewPage] = useState(1)
  const [editingRowGlobalIndex, setEditingRowGlobalIndex] = useState<number | null>(null)
  const [editQuantity, setEditQuantity] = useState('')

  const {
    data: inboundLines,
    isLoading: excelPreviewLoading,
    isError: excelPreviewIsError,
    error: excelPreviewErrorObj,
  } = useInboundLines(selectedRowForExcel?.id != null ? parseInt(selectedRowForExcel.id, 10) : null, { enabled: excelModalOpen && !!selectedRowForExcel?.id })

  const [excelPreviewData, setExcelPreviewData] = useState<ExcelPreviewData | null>(null)
  const [excelPreviewSaveError, setExcelPreviewSaveError] = useState<string | null>(null)
  useEffect(() => {
    if (excelModalOpen && selectedRowForExcel && inboundLines) {
      setExcelPreviewData({
        headers: EXCEL_PREVIEW_HEADERS,
        rows: inboundLines.map((r) => [r.caseCode ?? '', r.poNo ?? '', r.eanCode ?? '', r.quantity ?? 0]),
      })
    }
  }, [excelModalOpen, selectedRowForExcel?.id, inboundLines])
  const excelPreviewError =
    excelPreviewSaveError ?? (excelPreviewIsError ? (excelPreviewErrorObj as Error)?.message ?? 'Satırlar alınamadı.' : null)

  const openExcelModal = (row: AsnRow) => {
    setSelectedRowForExcel(row)
    setExcelPreviewData(null)
    setExcelPreviewSaveError(null)
    setExcelPreviewPage(1)
    setEditingRowGlobalIndex(null)
    setExcelModalOpen(true)
  }

  const closeExcelModal = () => {
    setExcelModalOpen(false)
    setSelectedRowForExcel(null)
    setExcelPreviewData(null)
    setExcelPreviewSaveError(null)
    setExcelPreviewPage(1)
    setEditingRowGlobalIndex(null)
  }

  const handleOnayla = (row: AsnRow) => {
    if (row.durum !== 'Taslak') return
    setOnaylaLoadingId(row.id)
    setListError(null)
    setShowInsufficientBarcodesModal(false)
    setInsufficientBarcodes([])
    // ApiClient API_BASE eklediği için relative path kullan.
    api.post<{ ok: boolean; insufficientBarcodes?: string[]; insufficientBarcodesDetail?: InsufficientBarcodeRow[]; error?: string }>(`/api/inbound/${row.id}/onayla-erp`, undefined)
      .then((data) => {
        if (data.ok) {
          queryClient.invalidateQueries({ queryKey: ['asnList'] })
        } else {
          if (Array.isArray(data.insufficientBarcodes) && data.insufficientBarcodes.length > 0) {
            setInsufficientBarcodes(data.insufficientBarcodes)
            setInsufficientBarcodesDetail(Array.isArray(data.insufficientBarcodesDetail) ? data.insufficientBarcodesDetail : data.insufficientBarcodes.map((code: string) => ({ eanBarcode: code, openOrderQty: 0, loadedQty: 0, missingQty: 0 })))
            setInsufficientModalPage(1)
            setShowInsufficientBarcodesModal(true)
          } else {
            setListError(data.error || 'Onaylama başarısız.')
          }
        }
      })
      .catch((err) => {
        console.error('[Onayla] Hata:', err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
          setListError('İşlem zaman aşımına uğradı. API sunucusu konsolunu kontrol edin veya tekrar deneyin.')
        } else {
          setListError(errorMsg || 'Bağlantı hatası.')
        }
      })
      .finally(() => setOnaylaLoadingId(null))
  }

  const handleAlokasyonYap = (row: AsnRow) => {
    if (!confirm(`ASN No: ${row.asnNo}\nAlokasyon işlemini başlatmak istediğinize emin misiniz?`)) {
      return
    }
    setListError(null)
    // Optimistic update: Listede hemen "Alokasyon Yapılıyor" göster (backend de aynı statüyü atar)
    const currentFilters = getCurrentFilters()
    queryClient.setQueryData(
      ['asnList', { ...currentFilters, page: currentPage, pageSize: PAGE_SIZE }],
      (prev: { rows: AsnRow[]; totalCount: number } | undefined) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) => (r.id === row.id ? { ...r, durum: 'Alokasyon Yapılıyor' } : r)),
            }
          : prev
    )
    api.post<{ ok: boolean; error?: string }>(`/api/inbound/${row.id}/alokasyon-yap`, undefined)
      .then((data) => {
        if (data.ok) {
          setAlokasyonInfoModalOpen(true)
        } else {
          setListError(data.error || 'Alokasyon başlatılamadı.')
        }
        queryClient.invalidateQueries({ queryKey: ['asnList'] })
      })
      .catch((err: Error) => {
        setListError(err.message || 'Bağlantı hatası.')
        queryClient.invalidateQueries({ queryKey: ['asnList'] })
      })
  }

  /** Excel önizlemede İşlem sütununu Taslak ve Onaylı için göster; düzenleme/silme sadece Taslak'ta yapılır. */
  const showExcelRowActions =
    selectedRowForExcel &&
    (selectedRowForExcel.durum === 'Taslak' || selectedRowForExcel.durum === 'Onaylı')
  const excelRowEditable = selectedRowForExcel?.durum === 'Taslak'

  const handleDeletePreviewRow = (globalIndex: number) => {
    if (!excelPreviewData) return
    const newRows = excelPreviewData.rows.filter((_, i) => i !== globalIndex)
    setExcelPreviewData({ ...excelPreviewData, rows: newRows })
    setEditingRowGlobalIndex(null)
    const maxPage = Math.max(1, Math.ceil(newRows.length / EXCEL_PREVIEW_PAGE_SIZE))
    if (excelPreviewPage > maxPage) setExcelPreviewPage(maxPage)
  }

  const handleSavePreviewRowQuantity = (globalIndex: number) => {
    if (!excelPreviewData || !selectedRowForExcel) return
    const num = parseInt(editQuantity, 10)
    if (Number.isNaN(num) || num < 0) return
    api.put<{ ok: boolean; error?: string }>(`/api/inbound/${selectedRowForExcel.id}/lines`, { lineIndex: globalIndex, quantity: num })
      .then((data) => {
        if (data.ok) {
          const newRows = excelPreviewData.rows.map((row, i) =>
            i === globalIndex ? [...(row as unknown[]).slice(0, 3), num] : row
          )
          setExcelPreviewData({ ...excelPreviewData, rows: newRows })
          setEditingRowGlobalIndex(null)
          setEditQuantity('')
          queryClient.invalidateQueries({ queryKey: ['inboundLines', selectedRowForExcel.id] })
        } else {
          setExcelPreviewSaveError(data.error || 'Adet güncellenemedi.')
        }
      })
      .catch((err: Error) => setExcelPreviewSaveError(err.message || 'Bağlantı hatası.'))
  }

  const excelPreviewTotalPages = excelPreviewData
    ? Math.max(1, Math.ceil(excelPreviewData.rows.length / EXCEL_PREVIEW_PAGE_SIZE))
    : 1
  const excelPreviewPaginatedRows = useMemo(() => {
    if (!excelPreviewData) return []
    const start = (excelPreviewPage - 1) * EXCEL_PREVIEW_PAGE_SIZE
    return excelPreviewData.rows.slice(start, start + EXCEL_PREVIEW_PAGE_SIZE)
  }, [excelPreviewData, excelPreviewPage])

  const setGridFilter = (key: string, value: string) => {
    setGridFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const filteredRows = useMemo(() => {
    let list = [...listRows]
    GRID_COLUMNS.forEach((col) => {
      if (col.filterType === 'none') return
      const v = (debouncedGridFilters[col.key] ?? '').trim().toLowerCase()
      if (!v) return
      if (col.filterType === 'text') {
        list = list.filter((r) => {
          const raw = (r as Record<string, unknown>)[col.key]
          const val = typeof raw === 'boolean' ? String(raw) : String(raw ?? '')
          return val.toLowerCase().includes(v)
        })
      } else {
        const filterVal = debouncedGridFilters[col.key]
        if (!filterVal) return
        list = list.filter((r) => {
          const raw = (r as Record<string, unknown>)[col.key]
          const val = typeof raw === 'boolean' ? String(raw) : String(raw ?? '')
          return val === filterVal
        })
      }
    })
    return list
  }, [listRows, debouncedGridFilters])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  const getCellValue = (row: AsnRow, key: string): string | boolean => {
    if (key === 'action') return ''
    const val = (row as Record<string, unknown>)[key]
    if (key === 'islemdeMi') return val ? 'Evet' : 'Hayır'
    if (typeof val === 'boolean') return val
    return String(val ?? '')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
      <h1>ASN Listele</h1>
        <p className={styles.subtitle}>
          ASN kayıtlarını filtreleyip listeleyebilirsiniz. Kaydettikten sonra yeni kayıtlar bu listede görünür.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Filtreler</h2>
        <div className={styles.filterGrid}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-firma">
              Firma
            </label>
            <select
              id="filter-firma"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className={styles.selectInput}
            >
              {FIRMA_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow} ref={warehouseDropdownRef}>
            <label className={styles.formLabel} id="filter-depo-label">
              Depo
            </label>
            <div className={styles.vendorDropdown}>
              <button
                type="button"
                id="filter-depo"
                aria-haspopup="listbox"
                aria-expanded={warehouseDropdownOpen}
                aria-labelledby="filter-depo-label"
                className={`${styles.selectInput} ${styles.vendorSelectTrigger}`}
                onClick={() => setWarehouseDropdownOpen((v) => !v)}
              >
                <span className={styles.vendorSelectValue} title={selectedWarehouseLabel || undefined}>
                  {selectedWarehouseLabel || '.. Hepsi ..'}
                </span>
                <span className={styles.vendorSelectChevron} aria-hidden>{warehouseDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {warehouseDropdownOpen && (
                <div className={styles.vendorDropdownPanel} role="listbox" aria-labelledby="filter-depo-label">
                  <div className={styles.vendorDropdownSearch}>
                    <input
                      ref={warehouseSearchInputRef}
                      type="search"
                      placeholder="Kod veya açıklama ara…"
                      value={warehouseSearch}
                      onChange={(e) => setWarehouseSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={styles.vendorSearchInput}
                      aria-label="Depo ara"
                    />
                  </div>
                  <div className={styles.vendorDropdownTableWrap}>
                    <table className={styles.vendorDropdownTable}>
                      <thead>
                        <tr>
                          <th className={styles.vendorDropdownTh}>Kod</th>
                          <th className={styles.vendorDropdownTh}>Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          role="option"
                          aria-selected={!depo}
                          className={styles.vendorDropdownRow}
                          onClick={() => { setDepo(''); setWarehouseDropdownOpen(false); }}
                        >
                          <td className={styles.vendorDropdownTd}>—</td>
                          <td className={styles.vendorDropdownTd}>.. Hepsi ..</td>
                        </tr>
                        {warehouseTotal === 0 && warehouseSearchLower ? (
                          <tr>
                            <td colSpan={2} className={styles.vendorDropdownEmpty}>
                              Sonuç bulunamadı
                            </td>
                          </tr>
                        ) : (
                          warehousePageOptions.map((opt) => (
                            <tr
                              key={opt.code}
                              role="option"
                              aria-selected={depo === opt.code}
                              className={styles.vendorDropdownRow}
                              onClick={() => { setDepo(opt.code ?? ''); setWarehouseDropdownOpen(false); }}
                            >
                              <td className={styles.vendorDropdownTd}>{opt.code}</td>
                              <td className={styles.vendorDropdownTd}>{opt.description || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.vendorDropdownPagination}>
                    <span className={styles.vendorDropdownPaginationInfo}>
                      Sayfa {warehousePage} / {warehouseTotalPages} ({warehouseTotal} öğe)
                    </span>
                    <div className={styles.vendorDropdownPaginationBtns}>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setWarehousePage(1)} disabled={warehousePage <= 1} aria-label="İlk sayfa">«</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setWarehousePage((p) => Math.max(1, p - 1))} disabled={warehousePage <= 1} aria-label="Önceki">‹</button>
                      {Array.from({ length: Math.min(7, warehouseTotalPages) }, (_, i) => {
                        let p: number
                        if (warehouseTotalPages <= 7) p = i + 1
                        else if (warehousePage <= 4) p = i + 1
                        else if (warehousePage >= warehouseTotalPages - 3) p = warehouseTotalPages - 6 + i
                        else p = warehousePage - 3 + i
                        return (
                          <button key={p} type="button" className={`${styles.vendorDropdownPageBtn} ${warehousePage === p ? styles.vendorDropdownPageBtnActive : ''}`} onClick={() => setWarehousePage(p)}>
                            {p}
                          </button>
                        )
                      })}
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setWarehousePage((p) => Math.min(warehouseTotalPages, p + 1))} disabled={warehousePage >= warehouseTotalPages} aria-label="Sonraki">›</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setWarehousePage(warehouseTotalPages)} disabled={warehousePage >= warehouseTotalPages} aria-label="Son sayfa">»</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.formRow} ref={vendorDropdownRef}>
            <label className={styles.formLabel} id="filter-satici-label">
              Satıcı
            </label>
            <div className={styles.vendorDropdown}>
              <button
                type="button"
                id="filter-satici"
                aria-haspopup="listbox"
                aria-expanded={vendorDropdownOpen}
                aria-labelledby="filter-satici-label"
                className={`${styles.selectInput} ${styles.vendorSelectTrigger}`}
                onClick={() => setVendorDropdownOpen((v) => !v)}
              >
                <span className={styles.vendorSelectValue} title={selectedVendorLabel || undefined}>
                  {selectedVendorLabel || '.. Hepsi ..'}
                </span>
                <span className={styles.vendorSelectChevron} aria-hidden>{vendorDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {vendorDropdownOpen && (
                <div className={styles.vendorDropdownPanel} role="listbox" aria-labelledby="filter-satici-label">
                  <div className={styles.vendorDropdownSearch}>
                    <input
                      ref={vendorSearchInputRef}
                      type="search"
                      placeholder="Kod veya unvan ara…"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={styles.vendorSearchInput}
                      aria-label="Satıcı ara"
                    />
                  </div>
                  <div className={styles.vendorDropdownTableWrap}>
                    <table className={styles.vendorDropdownTable}>
                      <thead>
                        <tr>
                          <th className={styles.vendorDropdownTh}>Kod</th>
                          <th className={styles.vendorDropdownTh}>Unvan</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          role="option"
                          aria-selected={!satici}
                          className={styles.vendorDropdownRow}
                          onClick={() => { setSatici(''); setVendorDropdownOpen(false); }}
                        >
                          <td className={styles.vendorDropdownTd}>—</td>
                          <td className={styles.vendorDropdownTd}>.. Hepsi ..</td>
                        </tr>
                        {vendorTotal === 0 && vendorSearchLower ? (
                          <tr>
                            <td colSpan={2} className={styles.vendorDropdownEmpty}>
                              Sonuç bulunamadı
                            </td>
                          </tr>
                        ) : (
                          vendorPageOptions.map((opt) => (
                            <tr
                              key={opt.code}
                              role="option"
                              aria-selected={satici === opt.code}
                              className={styles.vendorDropdownRow}
                              onClick={() => { setSatici(opt.code ?? ''); setVendorDropdownOpen(false); }}
                            >
                              <td className={styles.vendorDropdownTd}>{opt.code}</td>
                              <td className={styles.vendorDropdownTd}>{opt.description || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.vendorDropdownPagination}>
                    <span className={styles.vendorDropdownPaginationInfo}>
                      Sayfa {vendorPage} / {vendorTotalPages} ({vendorTotal} öğe)
                    </span>
                    <div className={styles.vendorDropdownPaginationBtns}>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setVendorPage(1)} disabled={vendorPage <= 1} aria-label="İlk sayfa">«</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setVendorPage((p) => Math.max(1, p - 1))} disabled={vendorPage <= 1} aria-label="Önceki">‹</button>
                      {Array.from({ length: Math.min(7, vendorTotalPages) }, (_, i) => {
                        let p: number
                        if (vendorTotalPages <= 7) p = i + 1
                        else if (vendorPage <= 4) p = i + 1
                        else if (vendorPage >= vendorTotalPages - 3) p = vendorTotalPages - 6 + i
                        else p = vendorPage - 3 + i
                        return (
                          <button key={p} type="button" className={`${styles.vendorDropdownPageBtn} ${vendorPage === p ? styles.vendorDropdownPageBtnActive : ''}`} onClick={() => setVendorPage(p)}>
                            {p}
                          </button>
                        )
                      })}
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setVendorPage((p) => Math.min(vendorTotalPages, p + 1))} disabled={vendorPage >= vendorTotalPages} aria-label="Sonraki">›</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setVendorPage(vendorTotalPages)} disabled={vendorPage >= vendorTotalPages} aria-label="Son sayfa">»</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-islem-baslangic">
              İşlem Zamanı (Başlangıç)
            </label>
            <input
              id="filter-islem-baslangic"
              type="date"
              value={islemZamaniBaslangic}
              onChange={(e) => {
                const v = e.target.value
                setIslemZamaniBaslangic(v)
                if (v && islemZamaniBitis && v > islemZamaniBitis) setIslemZamaniBitis(v)
              }}
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-islem-bitis">
              İşlem Zamanı (Bitiş)
            </label>
            <input
              id="filter-islem-bitis"
              type="date"
              value={islemZamaniBitis}
              min={islemZamaniBaslangic || undefined}
              onChange={(e) => setIslemZamaniBitis(e.target.value)}
              className={styles.textInput}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-islemi-yapan">
              İşlemi Yapan
            </label>
            <select
              id="filter-islemi-yapan"
              value={islemiYapan}
              onChange={(e) => setIslemiYapan(e.target.value)}
              className={styles.selectInput}
            >
              {ISLEMI_YAPAN_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="filter-durum">
              Durum
            </label>
            <select
              id="filter-durum"
              value={durum}
              onChange={(e) => setDurum(e.target.value)}
              className={styles.selectInput}
            >
              {DURUM_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRowSorgula}>
            <button
              type="button"
              onClick={handleSorgula}
              disabled={listLoading}
              className={styles.sorgulaButton}
            >
              {listLoading ? 'Yükleniyor…' : 'Sorgula'}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ASN Kayıtları</h2>
        {listLoading && <p className={styles.loadingText}>Yükleniyor…</p>}
        {listError && (
          <div className={styles.error} role="alert">
            {listError}
          </div>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.gridTable}>
            <thead>
              <tr>
                {GRID_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
              <tr className={styles.filterRow}>
                {GRID_COLUMNS.map((col) => (
                  <td key={col.key}>
                    {col.filterType === 'text' && (
                      <input
                        type="text"
                        value={gridFilters[col.key] ?? ''}
                        onChange={(e) => setGridFilter(col.key, e.target.value)}
                        className={styles.gridFilterInput}
                        placeholder={col.label}
                      />
                    )}
                    {col.filterType === 'select' && (
                      <select
                        value={gridFilters[col.key] ?? ''}
                        onChange={(e) => setGridFilter(col.key, e.target.value)}
                        className={styles.gridFilterSelect}
                      >
                        {col.key === 'durum'
                          ? DURUM_OPTIONS.map((opt) => (
                              <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
                            ))
                          : EVET_HAYIR_OPTIONS.map((opt) => (
                              <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
                            ))}
                      </select>
                    )}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={GRID_COLUMNS.length} className={styles.emptyCell}>
                    {listError
                      ? listError
                      : listRows.length === 0 && !listLoading
                        ? 'Kayıt bulunamadı. ASN Dosyası Yükle sayfasından Excel yükleyip "Taslak Kaydet" ile kayıt oluşturun. Tarih aralığını genişletebilirsiniz.'
                        : 'Kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.id}>
                    {GRID_COLUMNS.map((col) => {
                      if (col.key === 'action') {
                        return (
                          <td key={col.key} className={styles.actionCell}>
                            <div className={styles.actionCellWrap}>
                              <button
                                type="button"
                                className={styles.iconBtnDoc}
                                title="Excel önizleme"
                                aria-label="Excel önizleme"
                                onClick={() => openExcelModal(row)}
                              >
                                <IconDocument />
                              </button>
                              {row.durum === 'Taslak' && (
                                <button
                                  type="button"
                                  className={styles.iconBtnOnayla}
                                  title="Onayla"
                                  aria-label={onaylaLoadingId === row.id ? 'Onaylanıyor…' : 'Onayla'}
                                  onClick={() => handleOnayla(row)}
                                  disabled={onaylaLoadingId === row.id}
                                >
                                  {onaylaLoadingId === row.id ? (
                                    <span className={styles.loadingSpinner} aria-hidden />
                                  ) : (
                                    <IconOnayla />
                                  )}
                                </button>
                              )}
                              {row.durum === 'Onaylı' && (
                                <button
                                  type="button"
                                  className={styles.iconBtnAlokasyon}
                                  title="Alokasyon Yap"
                                  aria-label="Alokasyon Yap"
                                  onClick={() => handleAlokasyonYap(row)}
                                >
                                  <IconAlokasyon />
                                </button>
                              )}
                            </div>
                          </td>
                        )
                      }
                      const val = getCellValue(row, col.key)
                      return (
                        <td key={col.key}>
                          {typeof val === 'boolean' ? (val ? '✓' : '') : val}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Sayfa {currentPage} / {totalPages} ({filteredRows.length} öğe)
          </span>
          <div className={styles.paginationButtons}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              aria-label="İlk sayfa"
            >
              «
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Önceki sayfa"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.pageBtn} ${currentPage === p ? styles.pageBtnActive : ''}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Sonraki sayfa"
            >
              ›
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              aria-label="Son sayfa"
            >
              »
            </button>
          </div>
        </div>
      </section>

      {alokasyonInfoModalOpen && (
        <div className={styles.infoModalOverlay} onClick={() => setAlokasyonInfoModalOpen(false)} role="presentation">
          <div
            className={styles.infoModalCardWrap}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="alokasyon-info-title"
          >
            <div className={styles.infoModalCard}>
              <button
                type="button"
                className={styles.infoModalClose}
                onClick={() => setAlokasyonInfoModalOpen(false)}
                aria-label="Kapat"
              >
                ×
              </button>
              <div className={styles.infoModalIconWrap}>
                <IconSuccessCircle />
              </div>
              <div className={styles.infoModalBody}>
                <h2 id="alokasyon-info-title" className={styles.infoModalTitle}>
                  Talebiniz Alındı
                </h2>
                <p className={styles.infoModalMessage}>
                  Alokasyon talebiniz alındı. ASN statüsünü bu listeden takip edebilirsiniz.
                </p>
                <div className={styles.infoModalActions}>
                  <button
                    type="button"
                    className={styles.infoModalBtnOk}
                    onClick={() => setAlokasyonInfoModalOpen(false)}
                  >
                    Tamam
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {excelModalOpen && selectedRowForExcel && (
        <div className={styles.modalOverlay} onClick={closeExcelModal} role="presentation">
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="excel-modal-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="excel-modal-title" className={styles.modalTitle}>
                Excel Önizleme – {selectedRowForExcel.dosyaAdi}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeExcelModal}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            {excelPreviewLoading && (
              <p className={styles.loadingText}>Satırlar yükleniyor…</p>
            )}
            {excelPreviewError && (
              <div className={styles.error} role="alert">
                {excelPreviewError}
              </div>
            )}
            {!excelPreviewLoading && excelPreviewData && (
              <>
            <p className={styles.modalSubtitle}>
              ASN No: {selectedRowForExcel.asnNo || '—'} · Toplam {excelPreviewData.rows.length} satır
            </p>
            <div className={styles.modalTableWrap}>
              <table className={styles.modalTable}>
                <thead>
                  <tr>
                    {showExcelRowActions && <th className={styles.modalThActions}>İşlem</th>}
                    {excelPreviewData.headers.map((h, i) => (
                      <th key={i}>{String(h ?? '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelPreviewPaginatedRows.map((row, rowIndex) => {
                    const globalIndex =
                      (excelPreviewPage - 1) * EXCEL_PREVIEW_PAGE_SIZE + rowIndex
                    const rowArr = row as unknown[]
                    const isEditing = editingRowGlobalIndex === globalIndex
                    return (
                      <tr key={`${excelPreviewPage}-${rowIndex}`}>
                        {showExcelRowActions && (
                          <td className={styles.modalTdActions}>
                            {excelRowEditable && isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className={styles.modalBtnPrimary}
                                  onClick={() =>
                                    handleSavePreviewRowQuantity(globalIndex)
                                  }
                                >
                                  Kaydet
                                </button>
                                <button
                                  type="button"
                                  className={styles.modalBtnSecondary}
                                  onClick={() => {
                                    setEditingRowGlobalIndex(null)
                                    setEditQuantity('')
                                  }}
                                >
                                  İptal
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={styles.modalBtnSecondary}
                                  title={excelRowEditable ? 'Satırı düzenle' : 'Sadece Taslak statüsünde düzenleme yapılabilir'}
                                  disabled={!excelRowEditable}
                                  onClick={() => {
                                    if (!excelRowEditable) return
                                    setEditingRowGlobalIndex(globalIndex)
                                    setEditQuantity(String(rowArr[3] ?? ''))
                                  }}
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  className={styles.modalBtnDanger}
                                  title={excelRowEditable ? 'Satırı sil' : 'Sadece Taslak statüsünde silme yapılabilir'}
                                  disabled={!excelRowEditable}
                                  onClick={() => excelRowEditable && handleDeletePreviewRow(globalIndex)}
                                >
                                  Sil
                                </button>
                              </>
                            )}
                          </td>
                        )}
                        {rowArr.map((cell, cellIndex) => (
                          <td key={cellIndex}>
                            {showExcelRowActions &&
                            excelRowEditable &&
                            isEditing &&
                            cellIndex === 3 ? (
                              <input
                                type="number"
                                min={0}
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                className={styles.modalQuantityInput}
                              />
                            ) : (
                              String(cell ?? '')
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.modalPagination}>
              <span className={styles.paginationInfo}>
                Sayfa {excelPreviewPage} / {excelPreviewTotalPages} ({excelPreviewData.rows.length} satır)
              </span>
              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setExcelPreviewPage(1)}
                  disabled={excelPreviewPage <= 1}
                  aria-label="İlk sayfa"
                >
                  «
                </button>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setExcelPreviewPage((p) => Math.max(1, p - 1))}
                  disabled={excelPreviewPage <= 1}
                  aria-label="Önceki sayfa"
                >
                  ‹
                </button>
                {Array.from({ length: excelPreviewTotalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.pageBtn} ${excelPreviewPage === p ? styles.pageBtnActive : ''}`}
                    onClick={() => setExcelPreviewPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setExcelPreviewPage((p) => Math.min(excelPreviewTotalPages, p + 1))}
                  disabled={excelPreviewPage >= excelPreviewTotalPages}
                  aria-label="Sonraki sayfa"
                >
                  ›
                </button>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setExcelPreviewPage(excelPreviewTotalPages)}
                  disabled={excelPreviewPage >= excelPreviewTotalPages}
                  aria-label="Son sayfa"
                >
                  »
                </button>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {showInsufficientBarcodesModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="insufficient-barcodes-title">
          <div className={`${styles.modalContent} ${styles.modalContentInsufficient}`} style={{ padding: '1.25rem' }}>
            <h2 id="insufficient-barcodes-title" className={styles.modalTitle}>Yeterli Açık Sipariş Olmayan EAN/Barcode</h2>
            <p className={styles.modalSubtitle} style={{ marginTop: '0.5rem' }}>
              Aşağıdaki EAN/barcode'lar için ERP'de yeterli açık sipariş bulunamadı. Onaylama yapılamadı.
            </p>
            <div className={styles.insufficientGridWrap}>
              <table className={styles.insufficientGrid}>
                <thead>
                  <tr>
                    <th>EanBarcode</th>
                    <th>Açık Sipariş Miktarı</th>
                    <th>Yüklenen Miktar</th>
                    <th>Eksik Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = insufficientBarcodesDetail.length
                    const totalPages = Math.max(1, Math.ceil(total / INSUFFICIENT_PAGE_SIZE))
                    const page = Math.min(insufficientModalPage, totalPages)
                    const start = (page - 1) * INSUFFICIENT_PAGE_SIZE
                    const pageRows = insufficientBarcodesDetail.slice(start, start + INSUFFICIENT_PAGE_SIZE)
                    const toggleExpand = (rowKey: string) => {
                      setExpandedInsufficientRow((prev) => {
                        const next = new Set(prev)
                        if (next.has(rowKey)) next.delete(rowKey)
                        else next.add(rowKey)
                        return next
                      })
                    }
                    return pageRows.flatMap((row, idx) => {
                      const rowKey = `${row.eanBarcode}|${row.poNumber ?? ''}|${start + idx}`
                      const hasDetails =
                        (row.erpOrders?.length ?? 0) > 0 || (row.draftReservations?.length ?? 0) > 0
                      const isExpanded = expandedInsufficientRow.has(rowKey)
                      return [
                        <tr key={`${row.eanBarcode}-${row.poNumber ?? ''}-${idx}`}>
                          <td>
                            {hasDetails ? (
                              <button
                                type="button"
                                className={styles.accordionBtn}
                                onClick={() => toggleExpand(rowKey)}
                                aria-expanded={isExpanded}
                                title={isExpanded ? 'Detayı kapat' : 'Detayı aç'}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </button>
                            ) : null}
                            {row.eanBarcode}
                          </td>
                          <td className={styles.insufficientNum}>{row.openOrderQty}</td>
                          <td className={styles.insufficientNum}>{row.loadedQty}</td>
                          <td className={styles.insufficientNum}>{row.missingQty}</td>
                        </tr>,
                        isExpanded && hasDetails ? (
                          <tr key={`${row.eanBarcode}-${row.poNumber ?? ''}-${idx}-detail`}>
                            <td colSpan={4} className={styles.insufficientDetailCell}>
                              <div className={styles.insufficientDetail}>
                                {row.erpOrders && row.erpOrders.length > 0 && (
                                  <div className={styles.insufficientDetailSection}>
                                    <strong>ERP Açık Siparişler:</strong>
                                    <ul>
                                      {row.erpOrders.map((o, i) => (
                                        <li key={i}>
                                          Sipariş #{o.orderNumber} — {o.quantity} adet
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {row.draftReservations && row.draftReservations.length > 0 && (
                                  <div className={styles.insufficientDetailSection}>
                                    <strong>Taslak Rezervasyonlar:</strong>
                                    <ul>
                                      {row.draftReservations.map((d, i) => (
                                        <li key={i}>
                                          Inbound #{d.inboundId} — {d.quantity} adet
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ].filter(Boolean)
                    })
                  })()}
                </tbody>
              </table>
            </div>
            {insufficientBarcodesDetail.length > 0 && (
              <div className={styles.insufficientPagination}>
                <span className={styles.paginationInfo}>
                  Sayfa {insufficientModalPage} / {Math.max(1, Math.ceil(insufficientBarcodesDetail.length / INSUFFICIENT_PAGE_SIZE))} ({insufficientBarcodesDetail.length} kayıt)
                </span>
                <div className={styles.paginationButtons}>
                  <button type="button" className={styles.pageBtn} onClick={() => setInsufficientModalPage((p) => Math.max(1, p - 1))} disabled={insufficientModalPage <= 1}>‹</button>
                  <button type="button" className={styles.pageBtn} onClick={() => setInsufficientModalPage((p) => Math.min(Math.ceil(insufficientBarcodesDetail.length / INSUFFICIENT_PAGE_SIZE), p + 1))} disabled={insufficientModalPage >= Math.ceil(insufficientBarcodesDetail.length / INSUFFICIENT_PAGE_SIZE)}>›</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e5e5' }}>
              <button type="button" onClick={() => setShowInsufficientBarcodesModal(false)} className={styles.modalBtnPrimary}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
