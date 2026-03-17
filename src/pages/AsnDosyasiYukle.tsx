import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import styles from './AsnDosyasiYukle.module.css'
import { api } from '../lib/api-client'
import { useCompanies, useWarehouses, useVendors, useChannelTemplates } from '../hooks/useMasterData'
import type { CompanyOption, CodeDescriptionOption, WarehouseOption, InsufficientBarcodeRow } from './AsnDosyasiYukle/types'
import { COLUMN_ALIASES, MAX_PREVIEW_ROWS, ASN_TEMPLATE_FILE_NAME, COMPANY_LOGO_MAP } from './AsnDosyasiYukle/constants'

/** API'den detay gelmezse Excel satırlarından (allRows) yüklenen miktarı hesaplar. */
function buildInsufficientDetailFromRows(
  barcodes: string[],
  allRows: unknown[][]
): InsufficientBarcodeRow[] {
  const loadedByBarcode: Record<string, number> = {}
  for (const row of allRows) {
    const b = row[2] != null ? String(row[2]).trim() : ''
    if (!b) continue
    const q = row[3] != null ? (typeof row[3] === 'number' ? row[3] : parseInt(String(row[3]), 10) || 0) : 0
    loadedByBarcode[b] = (loadedByBarcode[b] || 0) + q
  }
  return barcodes.map((code) => {
    const loadedQty = loadedByBarcode[code] ?? 0
    return { eanBarcode: code, openOrderQty: 0, loadedQty, missingQty: loadedQty }
  })
}

export function AsnDosyasiYukle() {
  const navigate = useNavigate()
  const { data: companiesData, isLoading: companiesLoading, isError: companiesIsError, error: companiesErrorObj } = useCompanies()
  const companies: CompanyOption[] = companiesData ?? []
  const companiesError = companiesIsError ? (companiesErrorObj as Error)?.message ?? 'Şirket listesi alınamadı' : null
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [selectedDepotId, setSelectedDepotId] = useState<string>('')
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [importFileNumber, setImportFileNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<unknown[][]>([])
  const [allRows, setAllRows] = useState<unknown[][]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [taslakSaving, setTaslakSaving] = useState(false)
  const [asnSaving, setAsnSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [showUndefinedEanModal, setShowUndefinedEanModal] = useState(false)
  const [undefinedEanCodes, setUndefinedEanCodes] = useState<string[]>([])
  const [showInsufficientBarcodesModal, setShowInsufficientBarcodesModal] = useState(false)
  const [, setInsufficientBarcodes] = useState<string[]>([])
  const [insufficientBarcodesDetail, setInsufficientBarcodesDetail] = useState<InsufficientBarcodeRow[]>([])
  const [insufficientModalPage, setInsufficientModalPage] = useState(1)
  const [expandedInsufficientRow, setExpandedInsufficientRow] = useState<Set<string>>(new Set())
  const INSUFFICIENT_PAGE_SIZE = 10
  /** Taslak başarıyla kaydedilip InboundId alındı – buton tekrar basılamasın, sayfa yenilenecek. */
  const [taslakSavedWithInboundId, setTaslakSavedWithInboundId] = useState(false)
  /** ASN başarıyla oluşturuldu – buton tekrar basılamasın, sayfa yenilenecek. */
  const [asnCreatedWithInboundId, setAsnCreatedWithInboundId] = useState(false)
  /** Çift tıklama / çift istek engeli: state güncellemesi asenkron olduğu için ref ile anında kilitle. */
  const taslakSubmitInProgressRef = useRef(false)
  const asnSubmitInProgressRef = useRef(false)
  /** Aynı tıklamadan gelen çift istek backend'de aynı key ile dedupe edilsin diye (ref ile tek key). */
  const asnIdempotencyKeyRef = useRef<string | null>(null)

  const companyCode = selectedCompanyId ?? ''
  const {
    data: warehousesData,
    isLoading: warehousesLoading,
    isError: warehousesIsError,
    error: warehousesErrorObj,
  } = useWarehouses(companyCode)
  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    isError: vendorsIsError,
    error: vendorsErrorObj,
  } = useVendors(companyCode)
  const {
    data: channelTemplatesData,
    isLoading: templatesLoading,
    isError: templatesIsError,
    error: templatesErrorObj,
  } = useChannelTemplates(companyCode)

  const warehouseOptions: WarehouseOption[] = (warehousesData ?? []).map((w) => ({
    code: w.code,
    description: w.description ?? '',
    isDefault: w.isDefault ?? false,
  }))
  const vendorOptions: CodeDescriptionOption[] = (vendorsData ?? []).map((v) => ({
    code: v.code,
    description: v.description ?? '',
  }))
  const channelTemplateOptions: CodeDescriptionOption[] = (channelTemplatesData ?? []).map((c) => ({
    code: c.code ?? '',
    description: c.description ?? '',
  }))

  const optionsLoading = companyCode ? (warehousesLoading || vendorsLoading || templatesLoading) : false
  const optionsError =
    !companyCode
      ? null
      : warehousesIsError
        ? (warehousesErrorObj as Error)?.message ?? 'Depo listesi alınamadı'
        : vendorsIsError
          ? (vendorsErrorObj as Error)?.message ?? 'Tedarikçi listesi alınamadı'
          : templatesIsError
            ? (templatesErrorObj as Error)?.message ?? 'Şablon listesi alınamadı'
            : warehouseOptions.length === 0 && vendorOptions.length === 0 && channelTemplateOptions.length === 0 && !optionsLoading
              ? `${companyCode} için depo, tedarikçi veya şablon tanımlı değil.`
              : null

  useEffect(() => {
    if (!companyCode) {
      setSelectedDepotId('')
      setSelectedSupplierId('')
      setSelectedTemplateId('')
      return
    }
    const warehouses = warehouseOptions
    const vendors = vendorOptions
    const templates = channelTemplateOptions
    setSelectedDepotId((prev) => {
      const stillValid = warehouses.some((w) => w.code === prev)
      const defaultWarehouse = warehouses.find((w) => w.isDefault)
      return stillValid ? prev : (defaultWarehouse?.code ?? warehouses[0]?.code ?? '')
    })
    setSelectedSupplierId((prev) => (vendors.some((x) => x.code === prev) ? prev : ''))
    setSelectedTemplateId((prev) => (templates.some((x) => x.code === prev) ? prev : ''))
  }, [companyCode, warehouseOptions, vendorOptions, channelTemplateOptions])

  const clearFile = useCallback(() => {
    setFile(null)
    setFileName('')
    setHeaders([])
    setRows([])
    setAllRows([])
    setTotalRows(0)
    setParseError(null)
    setSaveError(null)
    setSaveSuccess(null)
  }, [])

  /** Tüm süreci sıfırlar (İptal). */
  const handleIptal = useCallback(() => {
    setSelectedCompanyId(null)
    setSelectedDepotId('')
    setSelectedSupplierId('')
    setSelectedTemplateId('')
    setImportFileNumber('')
    clearFile()
  }, [clearFile])

  const buildPayload = useCallback(() => {
    const companyCode = selectedCompanyId ?? ''
    const rowsPayload = allRows.map((r) => ({
      packageNumber: r[0],
      poNumber: r[1],
      barcode: r[2],
      quantity: r[3] != null ? (typeof r[3] === 'number' ? r[3] : parseInt(String(r[3]), 10) || 0) : null,
    }))
    return {
      companyCode,
      warehouseCode: selectedDepotId,
      fileName,
      vendorCode: selectedSupplierId || null,
      channelTemplateCode: selectedTemplateId || null,
      importFileNumber: importFileNumber.trim() || null,
      processCode: 'BP',
      rows: rowsPayload,
    }
  }, [selectedCompanyId, selectedDepotId, selectedSupplierId, selectedTemplateId, importFileNumber, fileName, allRows])

  /** File'ı base64'e çevirir (API'ye gönderim için). */
  const fileToBase64 = useCallback((f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result?.includes(',') ? result.split(',')[1] : ''
        resolve(base64 || '')
      }
      reader.onerror = reject
      reader.readAsDataURL(f)
    })
  }, [])

  /** Taslak Kaydet – Açık sipariş kontrolü (ERP) + EAN kontrolü sonra Inbound + InboundLine kaydeder. */
  const handleTaslakKaydet = useCallback(async () => {
    if (taslakSubmitInProgressRef.current) return
    taslakSubmitInProgressRef.current = true
    setSaveError(null)
    setSaveSuccess(null)
    setShowUndefinedEanModal(false)
    setUndefinedEanCodes([])
    setShowInsufficientBarcodesModal(false)
    setInsufficientBarcodes([])
    setSaving(true)
    setTaslakSaving(true)
    try {
      const payload = buildPayload() as Record<string, unknown>
      if (file) {
        payload.fileContent = await fileToBase64(file)
      }
      const data = await api.post('/api/taslak-kaydet', payload) as {
        ok: boolean
        insufficientBarcodes?: string[]
        insufficientBarcodesDetail?: InsufficientBarcodeRow[]
        undefinedEanCodes?: string[]
        error?: string
        inboundId?: number
        lineCount?: number
      }
      if (!data.ok) {
        if (Array.isArray(data.insufficientBarcodes) && data.insufficientBarcodes.length > 0) {
          setInsufficientBarcodes(data.insufficientBarcodes)
          const detail = Array.isArray(data.insufficientBarcodesDetail) && data.insufficientBarcodesDetail.length > 0
            ? data.insufficientBarcodesDetail
            : buildInsufficientDetailFromRows(data.insufficientBarcodes, allRows)
          setInsufficientBarcodesDetail(detail)
          setInsufficientModalPage(1)
          setShowInsufficientBarcodesModal(true)
        } else if (Array.isArray(data.undefinedEanCodes) && data.undefinedEanCodes.length > 0) {
          setUndefinedEanCodes(data.undefinedEanCodes)
          setShowUndefinedEanModal(true)
        } else {
          setSaveError(data.error || 'Hata oluştu.')
        }
        return
      }
      setSaveSuccess(`Taslak kaydedildi. InboundId: ${data.inboundId}, ${data.lineCount} satır.`)
      setTaslakSavedWithInboundId(true)
      navigate('/asn-islemleri/asn-listele')
          } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Bağlantı hatası. npm run db:serve çalışıyor mu?')
    } finally {
      taslakSubmitInProgressRef.current = false
      setSaving(false)
      setTaslakSaving(false)
    }
  }, [buildPayload, file, fileToBase64, navigate])

  /** ASN Oluştur – ERP RunProc + Post ile açık sipariş kontrolü, ASN oluşturma. */
  const handleAsnOlustur = useCallback(async () => {
    if (asnSubmitInProgressRef.current) return
    asnSubmitInProgressRef.current = true
    if (!asnIdempotencyKeyRef.current) {
      asnIdempotencyKeyRef.current = crypto.randomUUID()
    }
    const idempotencyKey = asnIdempotencyKeyRef.current
    setSaveError(null)
    setSaveSuccess(null)
    setShowInsufficientBarcodesModal(false)
    setInsufficientBarcodes([])
    setSaving(true)
    setAsnSaving(true)
    try {
      const payload = buildPayload() as Record<string, unknown>
      payload.idempotencyKey = idempotencyKey
      if (file) {
        payload.fileContent = await fileToBase64(file)
      }
      const data = await api.post('/api/asn-olustur-erp', payload, { noRetry: true }) as {
        ok: boolean
        insufficientBarcodes?: string[]
        insufficientBarcodesDetail?: InsufficientBarcodeRow[]
        error?: string
        asnNo?: string
        lineCount?: number
      }
      if (!data.ok) {
        if (Array.isArray(data.insufficientBarcodes) && data.insufficientBarcodes.length > 0) {
          setInsufficientBarcodes(data.insufficientBarcodes)
          const detail = Array.isArray(data.insufficientBarcodesDetail) && data.insufficientBarcodesDetail.length > 0
            ? data.insufficientBarcodesDetail
            : buildInsufficientDetailFromRows(data.insufficientBarcodes, allRows)
          setInsufficientBarcodesDetail(detail)
          setInsufficientModalPage(1)
          setShowInsufficientBarcodesModal(true)
        } else {
          setSaveError(data.error || 'Hata oluştu.')
        }
        return
      }
      setSaveSuccess(`ASN oluşturuldu. ASN No: ${data.asnNo}, ${data.lineCount} satır.`)
      setAsnCreatedWithInboundId(true)
      navigate('/asn-islemleri/asn-listele')
          } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Bağlantı hatası. npm run db:serve çalışıyor mu?')
    } finally {
      asnIdempotencyKeyRef.current = null
      asnSubmitInProgressRef.current = false
      setSaving(false)
      setAsnSaving(false)
    }
  }, [buildPayload, file, fileToBase64, navigate])

  const parseExcel = useCallback((file: File) => {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          setParseError('Dosya okunamadı.')
          return
        }
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[firstSheetName]
        const parsed = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
        }) as unknown[][]
        if (parsed.length === 0) {
          setParseError('Excel dosyasında veri bulunamadı.')
          return
        }
        const headerRow = (parsed[0] as string[]).map((h) => String(h ?? '').trim())
        const dataRows = parsed.slice(1).filter((row) => row.some((cell) => cell !== '' && cell != null))

        const colIndices: number[] = []
        const headerNames: string[] = []
        for (const [canonical, aliases] of COLUMN_ALIASES) {
          const idx = headerRow.findIndex((h) => aliases.some((a) => a.toLowerCase() === h.toLowerCase()))
          colIndices.push(idx >= 0 ? idx : -1)
          headerNames.push(canonical)
        }
        const missing = COLUMN_ALIASES.filter((_, i) => colIndices[i] < 0).map(([c]) => c)
        if (missing.length > 0) {
          setParseError(`Eksik sütunlar: ${missing.join(', ')}. Gerekli: PackageNumber, PO Number, Barcode, Quantity.`)
          return
        }

        const normalizedRows = dataRows.map((row) =>
          colIndices.map((idx) => (idx >= 0 ? row[idx] ?? '' : ''))
        )
        setHeaders(headerNames)
        setRows(normalizedRows.slice(0, MAX_PREVIEW_ROWS))
        setAllRows(normalizedRows)
        setTotalRows(normalizedRows.length)
        setFileName(file.name)
        setFile(file)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Excel işlenirken hata oluştu.')
      }
    }
    reader.readAsBinaryString(file)
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) {
        const ext = selected.name.split('.').pop()?.toLowerCase()
        if (ext !== 'xlsx' && ext !== 'xls') {
          setParseError('Lütfen .xlsx veya .xls dosyası yükleyin.')
          return
        }
        parseExcel(selected)
      }
      e.target.value = ''
    },
    [parseExcel]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) {
        const ext = dropped.name.split('.').pop()?.toLowerCase()
        if (ext === 'xlsx' || ext === 'xls') parseExcel(dropped)
        else setParseError('Lütfen .xlsx veya .xls dosyası yükleyin.')
      }
    },
    [parseExcel]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDownloadTemplate = useCallback(() => {
    const headers = COLUMN_ALIASES.map(([canonical]) => canonical)
    const worksheet = XLSX.utils.aoa_to_sheet([headers])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ASN')
    XLSX.writeFile(workbook, ASN_TEMPLATE_FILE_NAME)
  }, [])

  const canProceedToExcel =
    !!selectedCompanyId &&
    !!selectedDepotId &&
    !!selectedSupplierId &&
    !!selectedTemplateId

  const [openStep1, setOpenStep1] = useState(true)
  const [openStep2, setOpenStep2] = useState(false)
  const [openStep3, setOpenStep3] = useState(false)
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false)
  const [vendorPage, setVendorPage] = useState(1)
  const [vendorSearch, setVendorSearch] = useState('')
  const vendorDropdownRef = useRef<HTMLDivElement>(null)
  const vendorSearchInputRef = useRef<HTMLInputElement>(null)
  const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false)
  const [warehousePage, setWarehousePage] = useState(1)
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseDropdownRef = useRef<HTMLDivElement>(null)
  const warehouseSearchInputRef = useRef<HTMLInputElement>(null)
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false)
  const [templatePage, setTemplatePage] = useState(1)
  const [templateSearch, setTemplateSearch] = useState('')
  const templateDropdownRef = useRef<HTMLDivElement>(null)
  const templateSearchInputRef = useRef<HTMLInputElement>(null)
  const SEARCHABLE_PAGE_SIZE = 10

  useEffect(() => {
    if (!vendorDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(e.target as Node)) {
        setVendorDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [vendorDropdownOpen])
  useEffect(() => {
    if (!warehouseDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target as Node)) {
        setWarehouseDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [warehouseDropdownOpen])
  useEffect(() => {
    if (!templateDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [templateDropdownOpen])

  useEffect(() => {
    if (vendorDropdownOpen) {
      setVendorPage(1)
      setVendorSearch('')
      setTimeout(() => vendorSearchInputRef.current?.focus(), 50)
    }
  }, [vendorDropdownOpen])
  useEffect(() => {
    if (warehouseDropdownOpen) {
      setWarehousePage(1)
      setWarehouseSearch('')
      setTimeout(() => warehouseSearchInputRef.current?.focus(), 50)
    }
  }, [warehouseDropdownOpen])
  useEffect(() => {
    if (templateDropdownOpen) {
      setTemplatePage(1)
      setTemplateSearch('')
      setTimeout(() => templateSearchInputRef.current?.focus(), 50)
    }
  }, [templateDropdownOpen])

  const vendorSearchLower = vendorSearch.trim().toLowerCase()
  const vendorFiltered = vendorSearchLower
    ? vendorOptions.filter(
        (o) =>
          (o.code && o.code.toLowerCase().includes(vendorSearchLower)) ||
          (o.description && o.description.toLowerCase().includes(vendorSearchLower))
      )
    : vendorOptions
  const vendorTotal = vendorFiltered.length
  const vendorTotalPages = Math.max(1, Math.ceil(vendorTotal / SEARCHABLE_PAGE_SIZE))
  const vendorPageStart = (Math.min(vendorPage, vendorTotalPages) - 1) * SEARCHABLE_PAGE_SIZE
  const vendorPageOptions = vendorFiltered.slice(vendorPageStart, vendorPageStart + SEARCHABLE_PAGE_SIZE)
  useEffect(() => {
    setVendorPage((p) => (vendorSearchLower ? 1 : Math.min(p, Math.max(1, vendorTotalPages))))
  }, [vendorSearchLower, vendorTotalPages])

  const warehouseSearchLower = warehouseSearch.trim().toLowerCase()
  const warehouseFiltered = warehouseSearchLower
    ? warehouseOptions.filter(
        (o) =>
          (o.code && o.code.toLowerCase().includes(warehouseSearchLower)) ||
          (o.description && o.description.toLowerCase().includes(warehouseSearchLower))
      )
    : warehouseOptions
  const warehouseTotal = warehouseFiltered.length
  const warehouseTotalPages = Math.max(1, Math.ceil(warehouseTotal / SEARCHABLE_PAGE_SIZE))
  const warehousePageStart = (Math.min(warehousePage, warehouseTotalPages) - 1) * SEARCHABLE_PAGE_SIZE
  const warehousePageOptions = warehouseFiltered.slice(warehousePageStart, warehousePageStart + SEARCHABLE_PAGE_SIZE)
  useEffect(() => {
    setWarehousePage((p) => (warehouseSearchLower ? 1 : Math.min(p, Math.max(1, warehouseTotalPages))))
  }, [warehouseSearchLower, warehouseTotalPages])

  const templateSearchLower = templateSearch.trim().toLowerCase()
  const templateFiltered = templateSearchLower
    ? channelTemplateOptions.filter((o) =>
          (o.code?.toLowerCase().includes(templateSearchLower) ?? false) ||
          (o.description?.toLowerCase().includes(templateSearchLower) ?? false)
        )
    : channelTemplateOptions
  const templateTotal = templateFiltered.length
  const templateTotalPages = Math.max(1, Math.ceil(templateTotal / SEARCHABLE_PAGE_SIZE))
  const templatePageStart = (Math.min(templatePage, templateTotalPages) - 1) * SEARCHABLE_PAGE_SIZE
  const templatePageOptions = templateFiltered.slice(templatePageStart, templatePageStart + SEARCHABLE_PAGE_SIZE)
  useEffect(() => {
    setTemplatePage((p) => (templateSearchLower ? 1 : Math.min(p, Math.max(1, templateTotalPages))))
  }, [templateSearchLower, templateTotalPages])

  useEffect(() => {
    if (selectedCompanyId) setOpenStep2(true)
    else setOpenStep2(false)
  }, [selectedCompanyId])

  useEffect(() => {
    if (canProceedToExcel) setOpenStep3(true)
    else setOpenStep3(false)
  }, [canProceedToExcel])

  const selectedVendor = vendorOptions.find((o) => o.code === selectedSupplierId)
  const selectedVendorLabel = selectedVendor ? (selectedVendor.description ? `${selectedVendor.code} – ${selectedVendor.description}` : selectedVendor.code) : ''
  const selectedWarehouse = warehouseOptions.find((o) => o.code === selectedDepotId)
  const selectedWarehouseLabel = selectedWarehouse ? (selectedWarehouse.description ? `${selectedWarehouse.code} – ${selectedWarehouse.description}` : selectedWarehouse.code) : ''
  const selectedTemplate = channelTemplateOptions.find((o) => o.code === selectedTemplateId)
  const selectedTemplateLabel = selectedTemplate ? (selectedTemplate.description ? `${selectedTemplate.code} – ${selectedTemplate.description}` : selectedTemplate.code) : ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>ASN Dosyası Yükle</h1>
        <p className={styles.subtitle}>
          Önce şirket seçin, ardından örnek şablonu indirip Excel dosyanızı yükleyin.
        </p>
      </header>

      <div className={styles.accordion}>
        <section className={styles.accordionItem}>
          <button
            type="button"
            className={`${styles.accordionHeader} ${openStep1 ? styles.accordionHeaderOpen : ''}`}
            onClick={() => setOpenStep1((v) => !v)}
            aria-expanded={openStep1}
          >
            <span className={styles.accordionStepNum}>1</span>
            <span className={styles.accordionTitle}>Şirket Seçimi</span>
            <span className={styles.accordionChevron} aria-hidden>›</span>
          </button>
          <div className={`${styles.accordionContent} ${openStep1 ? styles.accordionContentOpen : ''}`}>
            {companiesError && (
              <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>
                {companiesError}
              </div>
            )}
            {companiesLoading ? (
              <p className={styles.subtitle}>Şirket listesi yükleniyor…</p>
            ) : companies.length === 0 ? (
              <p className={styles.subtitle} style={{ color: 'var(--color-text-secondary, #666)' }}>
                Henüz şirket tanımlı değil. Veritabanında <code>dbo.cdCompany</code> tablosuna kayıt ekleyin veya <code>npm run db:scripts</code> ile seed scriptini çalıştırın.
              </p>
            ) : (
            <div className={styles.companyGrid}>
              {companies.map((company) => {
                const logo = company.companyCode ? COMPANY_LOGO_MAP[company.companyCode.toUpperCase()] : null
                return (
                <button
                  key={company.companyCode}
                  type="button"
                  className={`${styles.companyCard} ${selectedCompanyId === company.companyCode ? styles.companyCardSelected : ''}`}
                  onClick={() => setSelectedCompanyId(selectedCompanyId === company.companyCode ? null : company.companyCode)}
                >
                  {logo ? (
                    logo.endsWith('.pdf') ? (
                      <object
                        data={logo}
                        type="application/pdf"
                        className={styles.companyCardLogo}
                        aria-label={company.companyName}
                      />
                    ) : (
                      <img src={logo} alt="" className={styles.companyCardLogo} />
                    )
                  ) : (
                    <span className={styles.companyCardLetter}>{company.companyName.charAt(0)}</span>
                  )}
                  <span className={styles.companyCardName}>{company.companyName}</span>
                </button>
                )
              })}
            </div>
            )}
          </div>
        </section>

        <section className={styles.accordionItem}>
          <button
            type="button"
            className={`${styles.accordionHeader} ${!selectedCompanyId ? styles.accordionHeaderDisabled : ''} ${openStep2 ? styles.accordionHeaderOpen : ''}`}
            onClick={() => selectedCompanyId && setOpenStep2((v) => !v)}
            disabled={!selectedCompanyId}
            aria-expanded={openStep2}
          >
            <span className={styles.accordionStepNum}>2</span>
            <span className={styles.accordionTitle}>Dosya Detayları</span>
            <span className={styles.accordionChevron} aria-hidden>›</span>
          </button>
          <div className={`${styles.accordionContent} ${openStep2 ? styles.accordionContentOpen : ''}`}>
            {optionsError && (
              <div className={styles.error} role="alert" style={{ marginBottom: '1rem' }}>
                {optionsError}
              </div>
            )}
          <div className={styles.formDetailsGrid}>
          <div className={styles.formRow} ref={warehouseDropdownRef}>
            <label className={styles.formLabel} id="depo-label">
              Depo <span className={styles.required}>*</span>
            </label>
            <div className={styles.vendorDropdown}>
              <button
                type="button"
                id="depo-select"
                aria-haspopup="listbox"
                aria-expanded={warehouseDropdownOpen}
                aria-labelledby="depo-label"
                className={`${styles.selectInput} ${styles.vendorSelectTrigger}`}
                disabled={optionsLoading}
                onClick={() => setWarehouseDropdownOpen((v) => !v)}
              >
                <span className={styles.vendorSelectValue} title={selectedWarehouseLabel || undefined}>
                  {optionsLoading ? 'Yükleniyor…' : selectedWarehouseLabel || 'Seçiniz'}
                </span>
                <span className={styles.vendorSelectChevron} aria-hidden>{warehouseDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {warehouseDropdownOpen && (
                <div className={styles.vendorDropdownPanel} role="listbox" aria-labelledby="depo-label">
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
                          aria-selected={!selectedDepotId}
                          className={styles.vendorDropdownRow}
                          onClick={() => { setSelectedDepotId(''); setWarehouseDropdownOpen(false); }}
                        >
                          <td className={styles.vendorDropdownTd}>—</td>
                          <td className={styles.vendorDropdownTd}>Seçiniz</td>
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
                              aria-selected={selectedDepotId === opt.code}
                              className={styles.vendorDropdownRow}
                              onClick={() => { setSelectedDepotId(opt.code); setWarehouseDropdownOpen(false); }}
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
            <label className={styles.formLabel} id="tedarikci-label">
              Tedarikçi <span className={styles.required}>*</span>
            </label>
            <div className={styles.vendorDropdown}>
              <button
                type="button"
                id="tedarikci-select"
                aria-haspopup="listbox"
                aria-expanded={vendorDropdownOpen}
                aria-labelledby="tedarikci-label"
                className={`${styles.selectInput} ${styles.vendorSelectTrigger}`}
                disabled={optionsLoading}
                onClick={() => setVendorDropdownOpen((v) => !v)}
              >
                <span className={styles.vendorSelectValue} title={selectedVendorLabel || undefined}>
                  {optionsLoading ? 'Yükleniyor…' : selectedVendorLabel || 'Seçiniz'}
                </span>
                <span className={styles.vendorSelectChevron} aria-hidden>{vendorDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {vendorDropdownOpen && (
                <div className={styles.vendorDropdownPanel} role="listbox" aria-labelledby="tedarikci-label">
                  <div className={styles.vendorDropdownSearch}>
                    <input
                      ref={vendorSearchInputRef}
                      type="search"
                      placeholder="Kod veya unvan ara…"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={styles.vendorSearchInput}
                      aria-label="Tedarikçi ara"
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
                          aria-selected={!selectedSupplierId}
                          className={styles.vendorDropdownRow}
                          onClick={() => { setSelectedSupplierId(''); setVendorDropdownOpen(false); }}
                        >
                          <td className={styles.vendorDropdownTd}>—</td>
                          <td className={styles.vendorDropdownTd}>Seçiniz</td>
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
                              aria-selected={selectedSupplierId === opt.code}
                              className={styles.vendorDropdownRow}
                              onClick={() => { setSelectedSupplierId(opt.code); setVendorDropdownOpen(false); }}
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

          <div className={styles.formRow} ref={templateDropdownRef}>
            <label className={styles.formLabel} id="tahsisat-label">
              Tahsisat Şablonu <span className={styles.required}>*</span>
            </label>
            <div className={styles.vendorDropdown}>
              <button
                type="button"
                id="tahsisat-select"
                aria-haspopup="listbox"
                aria-expanded={templateDropdownOpen}
                aria-labelledby="tahsisat-label"
                className={`${styles.selectInput} ${styles.vendorSelectTrigger}`}
                disabled={optionsLoading}
                onClick={() => setTemplateDropdownOpen((v) => !v)}
              >
                <span className={styles.vendorSelectValue} title={selectedTemplateLabel || undefined}>
                  {optionsLoading ? 'Yükleniyor…' : selectedTemplateLabel || 'Seçiniz'}
                </span>
                <span className={styles.vendorSelectChevron} aria-hidden>{templateDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {templateDropdownOpen && (
                <div className={styles.vendorDropdownPanel} role="listbox" aria-labelledby="tahsisat-label">
                  <div className={styles.vendorDropdownSearch}>
                    <input
                      ref={templateSearchInputRef}
                      type="search"
                      placeholder="Kod ara…"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={styles.vendorSearchInput}
                      aria-label="Tahsisat şablonu ara"
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
                          aria-selected={!selectedTemplateId}
                          className={styles.vendorDropdownRow}
                          onClick={() => { setSelectedTemplateId(''); setTemplateDropdownOpen(false); }}
                        >
                          <td className={styles.vendorDropdownTd}>—</td>
                          <td className={styles.vendorDropdownTd}>Seçiniz</td>
                        </tr>
                        {templateTotal === 0 && templateSearchLower ? (
                          <tr>
                            <td colSpan={2} className={styles.vendorDropdownEmpty}>
                              Sonuç bulunamadı
                            </td>
                          </tr>
                        ) : (
                          templatePageOptions.map((opt) => (
                            <tr
                              key={opt.code}
                              role="option"
                              aria-selected={selectedTemplateId === opt.code}
                              className={styles.vendorDropdownRow}
                              onClick={() => { setSelectedTemplateId(opt.code); setTemplateDropdownOpen(false); }}
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
                      Sayfa {templatePage} / {templateTotalPages} ({templateTotal} öğe)
                    </span>
                    <div className={styles.vendorDropdownPaginationBtns}>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setTemplatePage(1)} disabled={templatePage <= 1} aria-label="İlk sayfa">«</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setTemplatePage((p) => Math.max(1, p - 1))} disabled={templatePage <= 1} aria-label="Önceki">‹</button>
                      {Array.from({ length: Math.min(7, templateTotalPages) }, (_, i) => {
                        let p: number
                        if (templateTotalPages <= 7) p = i + 1
                        else if (templatePage <= 4) p = i + 1
                        else if (templatePage >= templateTotalPages - 3) p = templateTotalPages - 6 + i
                        else p = templatePage - 3 + i
                        return (
                          <button key={p} type="button" className={`${styles.vendorDropdownPageBtn} ${templatePage === p ? styles.vendorDropdownPageBtnActive : ''}`} onClick={() => setTemplatePage(p)}>
                            {p}
                          </button>
                        )
                      })}
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setTemplatePage((p) => Math.min(templateTotalPages, p + 1))} disabled={templatePage >= templateTotalPages} aria-label="Sonraki">›</button>
                      <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setTemplatePage(templateTotalPages)} disabled={templatePage >= templateTotalPages} aria-label="Son sayfa">»</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="import-file-number">
              İthalat Dosya Numarası <span className={styles.optional}>(opsiyonel)</span>
            </label>
            <input
              id="import-file-number"
              type="text"
              value={importFileNumber}
              onChange={(e) => setImportFileNumber(e.target.value)}
              placeholder="Örn. IMP-2024-001"
              className={styles.textInput}
            />
          </div>
          </div>
          </div>
        </section>

        <section className={styles.accordionItem}>
          <button
            type="button"
            className={`${styles.accordionHeader} ${!canProceedToExcel ? styles.accordionHeaderDisabled : ''} ${openStep3 ? styles.accordionHeaderOpen : ''}`}
            onClick={() => canProceedToExcel && setOpenStep3((v) => !v)}
            disabled={!canProceedToExcel}
            aria-expanded={openStep3}
          >
            <span className={styles.accordionStepNum}>3</span>
            <span className={styles.accordionTitle}>Dosya Yükle</span>
            <span className={styles.accordionChevron} aria-hidden>›</span>
          </button>
          <div className={`${styles.accordionContent} ${openStep3 ? styles.accordionContentOpen : ''}`}>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className={styles.downloadBtn}
            >
              <span className={styles.downloadIcon}>↓</span>
              Örnek şablonu indir (ASNFileFormat.xlsx)
            </button>

            <h3 className={styles.accordionSubtitle}>Excel dosyasını yükle</h3>
        {!file ? (
          <>
            <div
              className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
                className={styles.fileInput}
                id="asn-file-input"
              />
              <label htmlFor="asn-file-input" className={styles.dropZoneLabel}>
                <span className={styles.dropZoneIcon}>📄</span>
                <span>Dosyayı buraya sürükleyin veya tıklayarak seçin</span>
                <span className={styles.dropZoneHint}>Sadece .xlsx veya .xls dosyaları kabul edilir</span>
              </label>
            </div>
            {parseError && (
              <div className={styles.error} role="alert">
                {parseError}
              </div>
            )}
          </>
        ) : (
          <div className={styles.fileCard}>
            <div className={styles.fileCardTop}>
              <span className={styles.fileName}>📎 {fileName}</span>
              <span className={styles.fileMeta}>{totalRows} satır veri</span>
              <div className={styles.fileActions}>
                <button type="button" onClick={clearFile} className={styles.btnSecondary}>
                  Dosyayı kaldır
                </button>
                <label htmlFor="asn-file-replace" className={styles.btnPrimary}>
                  Yeni dosya yükle
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onFileChange}
                  className={styles.hiddenInput}
                  id="asn-file-replace"
                />
              </div>
            </div>
            {parseError && (
              <div className={styles.error} role="alert">
                {parseError}
              </div>
            )}
          </div>
        )}
          </div>
      </section>
      </div>

      {file && headers.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Önizleme</h2>
          <p className={styles.sectionDesc}>
            Yüklenen dosyanın ilk {Math.min(MAX_PREVIEW_ROWS, totalRows)} satırı aşağıda gösterilmektedir.
            {totalRows > MAX_PREVIEW_ROWS && ` Toplam ${totalRows} satır.`}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{String(h ?? '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {headers.map((_, colIndex) => (
                      <td key={colIndex}>{String(row[colIndex] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saveError && (
            <div className={styles.error} role="alert">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className={styles.success} role="status">
              {saveSuccess}
            </div>
          )}
          <div className={styles.actionBar}>
            <button type="button" onClick={handleIptal} className={styles.btnSecondary} disabled={saving}>
              İptal
            </button>
            <button type="button" onClick={handleTaslakKaydet} className={styles.btnDraft} disabled={saving || taslakSavedWithInboundId}>
              {taslakSaving ? (
                <>
                  <span className={styles.loadingSpinner} aria-hidden />
                  Kaydediliyor…
                </>
              ) : (
                'Taslak Kaydet'
              )}
            </button>
            <button type="button" onClick={handleAsnOlustur} className={styles.btnPrimary} disabled={saving || asnCreatedWithInboundId}>
              {asnSaving ? (
                <>
                  <span className={styles.loadingSpinner} aria-hidden />
                  Oluşturuluyor…
                </>
              ) : (
                'ASN Oluştur'
              )}
            </button>
          </div>
        </section>
      )}

      {showUndefinedEanModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="undefined-ean-title">
          <div className={styles.modalContent}>
            <h2 id="undefined-ean-title" className={styles.modalTitle}>Tanımsız EAN Kodları</h2>
            <p className={styles.modalDesc}>
              Aşağıdaki EAN kodları veritabanında (ItemBarcode) bulunamadı. Taslak kaydedilmedi. Lütfen master veriyi güncelleyin veya Excel dosyasını kontrol edin.
            </p>
            <ul className={styles.modalEanList}>
              {undefinedEanCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowUndefinedEanModal(false)} className={styles.btnPrimary}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsufficientBarcodesModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="insufficient-barcodes-title">
          <div className={`${styles.modalContent} ${styles.modalContentInsufficient}`}>
            <h2 id="insufficient-barcodes-title" className={styles.modalTitle}>Yeterli Açık Sipariş Olmayan EAN/Barcode</h2>
            <p className={styles.modalDesc}>
              Aşağıdaki EAN/barcode'lar için ERP'de yeterli açık sipariş bulunamadı. Taslak/ASN kaydedilmedi. Lütfen siparişleri kontrol edin.
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
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowInsufficientBarcodesModal(false)} className={styles.btnPrimary}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
