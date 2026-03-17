import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { api } from '../../lib/api-client'

/* ── Types ── */

export interface DispOrder {
  dispOrderHeaderId: number
  dispOrderNo: string
  orderDate: string
  customerCode: string
  customerName: string
  warehouseName: string
  warehouseCode?: string
  warehouseDescription?: string
  statusId: number
  statusName: string
  approvalDate: string | null
  statusDate?: string | null
  waitReason: string | null
  totalAmount: number
  totalQty: number
  type?: string
  company?: string
  sourceDispOrderHeaderId?: string | null
  currAccTypeCode?: number | null
  currAccDescription?: string
  currAccInfo?: string
  subCurrAccId?: string
  subCurrAccDescription?: string
  subCurrAccInfo?: string
  baseAmount?: number
  itAtt02?: string
  category?: string
  brand?: string
}

/** Union DispApprovals grid ile birebir sütun tanımları. Sıra default görünüm. */
export const FINANS_ONAY_GRID_COLUMNS: { id: string; label: string; field: keyof DispOrder; defaultVisible: boolean; align?: 'right' }[] = [
  { id: 'dispOrderNo', label: 'Sevk Emri No', field: 'dispOrderNo', defaultVisible: true },
  { id: 'orderDate', label: 'Sevk Tarihi', field: 'orderDate', defaultVisible: true },
  { id: 'type', label: 'Tip', field: 'type', defaultVisible: true },
  { id: 'company', label: 'Firma', field: 'company', defaultVisible: false },
  { id: 'customerCode', label: 'Cari Kodu', field: 'customerCode', defaultVisible: true },
  { id: 'customerName', label: 'Cari Adı', field: 'customerName', defaultVisible: true },
  { id: 'subCurrAccDescription', label: 'Alt Müşteri', field: 'subCurrAccDescription', defaultVisible: false },
  { id: 'warehouseCode', label: 'Depo Kodu', field: 'warehouseCode', defaultVisible: false },
  { id: 'warehouseName', label: 'Depo', field: 'warehouseName', defaultVisible: true },
  { id: 'warehouseDescription', label: 'Depo Açıklama', field: 'warehouseDescription', defaultVisible: false },
  { id: 'baseAmount', label: 'PSF Tutar', field: 'baseAmount', defaultVisible: true, align: 'right' },
  { id: 'totalAmount', label: 'Fatura Tutarı', field: 'totalAmount', defaultVisible: true, align: 'right' },
  { id: 'totalQty', label: 'Adet', field: 'totalQty', defaultVisible: true, align: 'right' },
  { id: 'itAtt02', label: 'ITAtt02 / Sezon', field: 'itAtt02', defaultVisible: true },
  { id: 'statusName', label: 'Onay Durumu', field: 'statusName', defaultVisible: true },
  { id: 'statusDate', label: 'Onay Zamanı', field: 'statusDate', defaultVisible: true },
  { id: 'approvalDate', label: 'Onay Tarihi', field: 'approvalDate', defaultVisible: true },
  { id: 'waitReason', label: 'Bekleme Nedeni', field: 'waitReason', defaultVisible: true },
]

export interface DispOrderLine {
  lineNo: number
  itemCode: string
  itemName: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export interface StatusOption {
  id: number
  name: string
}

export interface SeasonOption {
  code: string
  description: string
}

export interface WaitReasonOption {
  code: string
  name: string
}

export interface CustomerSummary {
  customerCode: string
  customerName: string
  creditLimit: number
  balance: number
  risk: number
  availableCredit: number
  overdueAmount: number
  avgPaymentDays: number
  workingMethod?: string
  workingMethodCode?: string
  letterOfGuaranteeEarliestDue?: string | null
  teminatMektubuTutari?: number
  alinanCekAktifSezon?: number
  alinanCekEskiezon?: number
  sevkiyatTemin?: number
  kalanSiparisBakiyesi?: number
}

/** Cari özet satırı (Finans Onay ilk grid). */
export interface CariOzetRow {
  company: string
  currAccCode: string
  currAccDescription: string
  dispCount: number
  baseAmount: number
  totalAmount: number
  amountApproved: number
  amountApprovedNew: number
  amountApprovedDiff: number
  /** Bu caride en az bir sevk emri Beklet (1) durumunda. */
  hasBeklet?: boolean
  /** Bu carideki tüm sevk emirleri Onaylı (2) durumunda. */
  hasAllOnayli?: boolean
  /** Beklet durumundaki sevk emirlerinden örnek gerekçe (tooltip/kolonda gösterilir). */
  waitReasonSample?: string | null
}

export interface Filters {
  company: string
  customer: string
  fromDate: string
  toDate: string
  status: string
  season: string
  /** Çoklu seçim için (UI); API'ye ilk değer gider */
  statusIds: number[]
  seasonCodes: string[]
  asnNo: string
  orderNo: string
  limitAmount: number
  contract: string
}

const INITIAL_FILTERS: Filters = {
  company: '',
  customer: '',
  fromDate: '',
  toDate: '',
  status: '',
  season: '',
  statusIds: [],
  seasonCodes: [],
  asnNo: '',
  orderNo: '',
  limitAmount: 0,
  contract: '',
}

const GRID_PREFS_KEY = 'finansOnay_grid'

function loadGridPreferences(userId: number | undefined): { columnOrder: string[]; columnVisibility: Record<string, boolean> } {
  const key = userId != null ? `${GRID_PREFS_KEY}_${userId}` : GRID_PREFS_KEY
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (raw) {
      const parsed = JSON.parse(raw) as { columnOrder?: string[]; columnVisibility?: Record<string, boolean> }
      if (parsed?.columnOrder && Array.isArray(parsed.columnOrder)) {
        const visibility = parsed.columnVisibility && typeof parsed.columnVisibility === 'object' ? parsed.columnVisibility : {}
        return { columnOrder: parsed.columnOrder, columnVisibility: visibility }
      }
    }
  } catch (_) { /* ignore */ }
  const defaultOrder = FINANS_ONAY_GRID_COLUMNS.map(c => c.id)
  const defaultVisibility: Record<string, boolean> = {}
  FINANS_ONAY_GRID_COLUMNS.forEach(c => { defaultVisibility[c.id] = c.defaultVisible })
  return { columnOrder: defaultOrder, columnVisibility: defaultVisibility }
}

function saveGridPreferences(userId: number | undefined, columnOrder: string[], columnVisibility: Record<string, boolean>) {
  const key = userId != null ? `${GRID_PREFS_KEY}_${userId}` : GRID_PREFS_KEY
  try {
    localStorage.setItem(key, JSON.stringify({ columnOrder, columnVisibility }))
  } catch (_) { /* ignore */ }
}

export function useFinansOnay(userId?: number) {
  const [companies, setCompanies] = useState<{ companyCode: string; companyName: string }[]>([])
  const [customers, setCustomers] = useState<{ code: string; description: string }[]>([])
  const [filterStatuses, setFilterStatuses] = useState<StatusOption[]>([])
  const [actionStatuses, setActionStatuses] = useState<StatusOption[]>([])
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [waitReasons, setWaitReasons] = useState<WaitReasonOption[]>([])

  const [filters, setFilters] = useState<Filters>({ ...INITIAL_FILTERS })
  const [appliedFilters, setAppliedFilters] = useState<Filters | null>(null)
  const [cariOzet, setCariOzet] = useState<CariOzetRow[]>([])
  const [cariPage, setCariPage] = useState(1)
  const [cariPageSize] = useState(15)
  const [totalCariCount, setTotalCariCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [rows, _setRows] = useState<DispOrder[]>([])
  const [total, _setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeAction, setActiveAction] = useState<number | null>(null)
  const [waitReasonInput, setWaitReasonInput] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedCariKeys, setSelectedCariKeys] = useState<Set<string>>(new Set())
  const [bekletModalOpen, setBekletModalOpen] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOrder, setDetailOrder] = useState<DispOrder | null>(null)
  const [detailLines, setDetailLines] = useState<DispOrderLine[]>([])

  const [customerSummaryOpen, setCustomerSummaryOpen] = useState(false)
  const [customerSummaryLoading, setCustomerSummaryLoading] = useState(false)
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary | null>(null)

  const [cariSevkModalOpen, setCariSevkModalOpen] = useState(false)
  const [cariSevkModalCari, setCariSevkModalCari] = useState<CariOzetRow | null>(null)
  const [cariSevkOrders, setCariSevkOrders] = useState<DispOrder[]>([])
  const [cariSevkLoading, setCariSevkLoading] = useState(false)
  const [cariSevkTotalCount, setCariSevkTotalCount] = useState(0)
  const [cariSevkPage, setCariSevkPage] = useState(1)
  const [cariSevkPageSize] = useState(15)
  const [selectedCariSevkIds, setSelectedCariSevkIds] = useState<Set<number>>(new Set())
  const [bekletSource, setBekletSource] = useState<'cari' | 'cariSevk' | null>(null)
  const applyCariSevkActionRef = useRef<(statusId: number, waitReason?: string | null) => Promise<void>>(async () => {})
  const [cariSevkOzet, setCariSevkOzet] = useState<{
    unapprovedCount: number
    unapprovedQty: number
    unapprovedAmount: number
    approvedCount: number
    approvedQty: number
    approvedAmount: number
  } | null>(null)
  const [cariSevkOzetLoading, setCariSevkOzetLoading] = useState(false)

  const [gridColumnOrder, setGridColumnOrder] = useState<string[]>(() => loadGridPreferences(userId).columnOrder)
  const [gridColumnVisibility, setGridColumnVisibility] = useState<Record<string, boolean>>(() => loadGridPreferences(userId).columnVisibility)

  /* ── Grid column preferences: kullanıcı bazında yükleme (userId değişince) ── */
  useEffect(() => {
    const prefs = loadGridPreferences(userId)
    const mergedOrder = [...prefs.columnOrder]
    FINANS_ONAY_GRID_COLUMNS.forEach(c => { if (!mergedOrder.includes(c.id)) mergedOrder.push(c.id) })
    setGridColumnOrder(mergedOrder)
    setGridColumnVisibility(prefs.columnVisibility)
  }, [userId])

  /* ── Grid column preferences: değişince kaydet ── */
  useEffect(() => {
    saveGridPreferences(userId, gridColumnOrder, gridColumnVisibility)
  }, [userId, gridColumnOrder, gridColumnVisibility])

  const visibleGridColumns = useMemo(() => {
    const byId = new Map(FINANS_ONAY_GRID_COLUMNS.map(c => [c.id, c]))
    const visible: typeof FINANS_ONAY_GRID_COLUMNS = []
    for (const id of gridColumnOrder) {
      const col = byId.get(id)
      if (col && gridColumnVisibility[id] !== false) visible.push(col)
    }
    for (const col of FINANS_ONAY_GRID_COLUMNS) {
      if (!gridColumnOrder.includes(col.id) && gridColumnVisibility[col.id] !== false) visible.push(col)
    }
    return visible
  }, [gridColumnOrder, gridColumnVisibility])

  const setColumnOrder = useCallback((order: string[]) => setGridColumnOrder(order), [])
  const setColumnVisible = useCallback((id: string, visible: boolean) => {
    setGridColumnVisibility(prev => ({ ...prev, [id]: visible }))
  }, [])

  /* ── Lookups ── */

  useEffect(() => {
    api.get<{ rows?: { companyCode: string; companyName: string }[] }>('/api/companies')
      .then((res: any) => setCompanies(Array.isArray(res?.rows) ? res.rows : []))
      .catch(() => setCompanies([]))
    api.get<{ statuses?: StatusOption[] }>('/api/finance/statuses?mode=filter')
      .then((res: any) => setFilterStatuses(Array.isArray(res?.statuses) ? res.statuses : []))
      .catch(() => setFilterStatuses([]))
    api.get<{ statuses?: StatusOption[] }>('/api/finance/statuses?mode=select')
      .then((res: any) => setActionStatuses(Array.isArray(res?.statuses) ? res.statuses : []))
      .catch(() => setActionStatuses([]))
    api.get<{ reasons?: string[] }>('/api/finance/wait-reasons')
      .then((res: any) => {
        const list = Array.isArray(res?.reasons) ? res.reasons : []
        setWaitReasons(list.map((name: string, i: number) => ({ code: String(i), name })))
      })
      .catch(() => setWaitReasons([]))
  }, [])

  /* Tek firma varsa otomatik seç; böylece müşteri/sezon istekleri hemen atılır ve Network'te görünür. */
  useEffect(() => {
    if (companies.length === 1 && !filters.company) {
      setFilters(f => ({ ...f, company: companies[0].companyCode }))
    }
  }, [companies])

  useEffect(() => {
    if (!filters.company) { setSeasons([]); setCustomers([]); return }
    api.get<{ seasons?: { code: string; description: string }[] }>(`/api/finance/seasons?company=${encodeURIComponent(filters.company)}`)
      .then((res: { seasons?: { code?: string; description?: string }[] }) => setSeasons((Array.isArray(res?.seasons) ? res.seasons : []).map((s: { code?: string; description?: string }) => ({ code: s.code ?? '', description: s.description ?? s.code ?? '' }))))
      .catch(() => setSeasons([]))
    api.get<any>(`/api/finance/customers?company=${encodeURIComponent(filters.company)}`)
      .then((res: any) => {
        if (res?._error) console.warn('[müşteri]', res._error)
        const list: any[] = Array.isArray(res?.customers) ? res.customers : []
        setCustomers(list.map((c: any) => ({
          code: String(c?.code ?? ''),
          description: String(c?.description ?? c?.code ?? ''),
        })))
      })
      .catch(() => setCustomers([]))
  }, [filters.company])

  /* ── Cari özet grid (Finans Onay: sadece cari bazında özet) ── */

  const fetchCariOzet = useCallback(async (f: Filters, pageNum: number = 1) => {
    setLoading(true)
    setError('')
    try {
      const seasonParam = f.seasonCodes?.length ? f.seasonCodes[0] : f.season
      const params = new URLSearchParams({
        company: f.company,
        customer: f.customer,
        contract: f.contract ?? '',
        fromDate: f.fromDate,
        toDate: f.toDate,
        season: seasonParam,
        page: String(pageNum),
        pageSize: String(cariPageSize),
      })
      if (f.statusIds?.length) params.set('statusIds', f.statusIds.join(','))
      if (f.asnNo?.trim()) params.set('asnNo', f.asnNo.trim())
      if (f.orderNo?.trim()) params.set('orderNo', f.orderNo.trim())
      if (typeof f.limitAmount === 'number' && f.limitAmount > 0) params.set('limitAmount', String(f.limitAmount))
      const res = await api.get<{ rows?: CariOzetRow[]; totalCount?: number }>(`/api/finance/cari-ozet?${params}`)
      setCariOzet(Array.isArray(res?.rows) ? res.rows : [])
      setTotalCariCount(typeof res?.totalCount === 'number' ? res.totalCount : 0)
    } catch (e: any) {
      setError(e.message || 'Veri alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [cariPageSize])

  const search = useCallback(() => {
    setCariPage(1)
    setAppliedFilters({ ...filters })
  }, [filters])

  const resetFilters = useCallback(() => {
    setFilters({ ...INITIAL_FILTERS })
    setAppliedFilters(null)
    setCariOzet([])
    setCariPage(1)
    setTotalCariCount(0)
    setSelectedCariKeys(new Set())
  }, [])

  const fetchGrid = useCallback(() => {
    if (appliedFilters) fetchCariOzet(appliedFilters, cariPage)
  }, [appliedFilters, cariPage, fetchCariOzet])

  useEffect(() => {
    if (appliedFilters) fetchCariOzet(appliedFilters, cariPage)
  }, [appliedFilters, cariPage, fetchCariOzet])

  /* ── Cari seçimi (cari özet grid) ── */

  const toggleCariSelection = useCallback((row: CariOzetRow) => {
    const key = `${row.company}|${row.currAccCode}`
    setSelectedCariKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllCaris = useCallback(() => {
    setSelectedCariKeys(prev =>
      prev.size === cariOzet.length ? new Set() : new Set(cariOzet.map(r => `${r.company}|${r.currAccCode}`))
    )
  }, [cariOzet])

  const clearCariSelection = useCallback(() => setSelectedCariKeys(new Set()), [])

  const selectedCariCount = selectedCariKeys.size
  const allCarisSelected = cariOzet.length > 0 && selectedCariKeys.size === cariOzet.length

  /* ── Cari bazında Onayla / Beklet / Sıfırla ── */

  const applyCariAction = useCallback(async (statusId: number, waitReason?: string | null) => {
    if (selectedCariKeys.size === 0 || !appliedFilters) return
    setSaving(true)
    setError('')
    try {
      const currAccCodes = Array.from(selectedCariKeys).map(k => k.split('|')[1] || '')
      const body = {
        company: appliedFilters.company,
        currAccCodes,
        fromDate: appliedFilters.fromDate || undefined,
        toDate: appliedFilters.toDate || undefined,
        statusIds: appliedFilters.statusIds?.length ? appliedFilters.statusIds : undefined,
        season: appliedFilters.seasonCodes?.length ? appliedFilters.seasonCodes[0] : appliedFilters.season || undefined,
        contract: appliedFilters.contract || undefined,
        asnNo: appliedFilters.asnNo?.trim() || undefined,
        orderNo: appliedFilters.orderNo?.trim() || undefined,
      }
      const res = await api.post<{ dispOrderHeaderIds?: number[] }>('/api/finance/disp-orders/ids-by-cari', body)
      const ids = Array.isArray(res?.dispOrderHeaderIds) ? res.dispOrderHeaderIds : []
      if (ids.length === 0) {
        setError('Seçili carilere ait sevk emri bulunamadı.')
        return
      }
      const updates = ids.map(id => ({
        dispOrderHeaderId: id,
        statusId,
        waitReason: waitReason ?? null,
      }))
      await api.put('/api/finance/disp-orders/approve', { updates })
      setSelectedCariKeys(new Set())
      setBekletModalOpen(false)
      setWaitReasonInput('')
      fetchGrid()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız.')
    } finally {
      setSaving(false)
    }
  }, [selectedCariKeys, appliedFilters, fetchGrid])

  const handleCariOnayla = useCallback(() => applyCariAction(2), [applyCariAction])
  const handleCariSifirla = useCallback(() => applyCariAction(0), [applyCariAction])
  const handleCariBeklet = useCallback(() => {
    setBekletSource('cari')
    setBekletModalOpen(true)
  }, [])

  const confirmBeklet = useCallback(() => {
    const reasonText = waitReasonInput ? (waitReasons.find(r => r.code === waitReasonInput)?.name ?? waitReasonInput) : ''
    if (bekletSource === 'cariSevk') {
      applyCariSevkActionRef.current(1, reasonText)
      setBekletSource(null)
      setBekletModalOpen(false)
      setWaitReasonInput('')
    } else {
      applyCariAction(1, reasonText)
      setBekletSource(null)
    }
  }, [applyCariAction, waitReasonInput, waitReasons, bekletSource])

  const cancelBeklet = useCallback(() => {
    setBekletSource(null)
    setBekletModalOpen(false)
    setWaitReasonInput('')
  }, [])

  /* ── Selection (sevk grid – ileride kullanım) ── */

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === rows.length ? new Set() : new Set(rows.map((r: DispOrder) => r.dispOrderHeaderId)))
  }, [rows])

  const allSelected = rows.length > 0 && selectedIds.size === rows.length
  const cariTotalPages = Math.max(1, Math.ceil(totalCariCount / cariPageSize))
  const cariPageNumbers = useMemo(() => {
    const pages: number[] = []
    const start = Math.max(1, cariPage - 2)
    const end = Math.min(cariTotalPages, cariPage + 2)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [cariPage, cariTotalPages])

  /* ── Actions ── */

  const handleAction = useCallback(async (statusId: number) => {
    if (statusId === 1) {
      setActiveAction(1)
      return
    }
    setActiveAction(statusId)
    await applyStatus(statusId, '')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyStatus = useCallback(async (statusId: number, reason: string) => {
    if (selectedIds.size === 0) return
    setSaving(true)
    setError('')
    try {
      const updates = Array.from(selectedIds).map(id => ({
        dispOrderHeaderId: id,
        statusId,
        waitReason: reason || null,
      }))
      await api.put('/api/finance/disp-orders/approve', { updates })
      setActiveAction(null)
      setWaitReasonInput('')
      if (appliedFilters) fetchGrid()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız.')
    } finally {
      setSaving(false)
    }
  }, [selectedIds, appliedFilters, fetchGrid])

  const confirmWait = useCallback(() => {
    applyStatus(1, waitReasonInput)
  }, [applyStatus, waitReasonInput])

  const cancelAction = useCallback(() => {
    setActiveAction(null)
    setWaitReasonInput('')
  }, [])

  /* ── Detail popup ── */

  const openDetail = useCallback(async (order: DispOrder) => {
    setDetailOrder(order)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await api.get<{ lines?: DispOrderLine[] }>(`/api/finance/disp-orders/${order.dispOrderHeaderId}/lines`)
      setDetailLines(Array.isArray((res as any)?.lines) ? (res as any).lines : [])
    } catch {
      setDetailLines([])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    setDetailOrder(null)
    setDetailLines([])
  }, [])

  /* ── Customer summary popup ── */

  const openCustomerSummary = useCallback(async (code: string, company: string) => {
    setCustomerSummaryOpen(true)
    setCustomerSummaryLoading(true)
    setCustomerSummary(null)
    try {
      const path = `/api/finance/customer-summary/${encodeURIComponent(code)}?company=${encodeURIComponent(company)}`
      const data = await api.get<CustomerSummary & { ok?: boolean }>(path)
      if (data && typeof data === 'object' && 'customerCode' in data) {
        const d = data as any
        setCustomerSummary({
          customerCode: String(d.customerCode ?? code),
          customerName: String(d.customerName ?? ''),
          creditLimit: Number(d.creditLimit) || 0,
          balance: Number(d.balance) || 0,
          risk: Number(d.risk) || 0,
          availableCredit: Number(d.availableCredit) || 0,
          overdueAmount: Number(d.overdueAmount) || 0,
          avgPaymentDays: Number(d.avgPaymentDays) || 0,
          workingMethod: d.workingMethod != null ? String(d.workingMethod) : undefined,
          workingMethodCode: d.workingMethodCode != null ? String(d.workingMethodCode) : undefined,
          letterOfGuaranteeEarliestDue: d.letterOfGuaranteeEarliestDue ?? undefined,
          teminatMektubuTutari: d.teminatMektubuTutari != null ? Number(d.teminatMektubuTutari) : undefined,
          alinanCekAktifSezon: d.alinanCekAktifSezon != null ? Number(d.alinanCekAktifSezon) : undefined,
          alinanCekEskiezon: d.alinanCekEskiezon != null ? Number(d.alinanCekEskiezon) : undefined,
          sevkiyatTemin: d.sevkiyatTemin != null ? Number(d.sevkiyatTemin) : undefined,
          kalanSiparisBakiyesi: d.kalanSiparisBakiyesi != null ? Number(d.kalanSiparisBakiyesi) : undefined,
        })
      } else {
        setCustomerSummary(null)
      }
    } catch {
      setCustomerSummary(null)
    } finally {
      setCustomerSummaryLoading(false)
    }
  }, [])

  const closeCustomerSummary = useCallback(() => {
    setCustomerSummaryOpen(false)
    setCustomerSummary(null)
  }, [])

  /* ── Cari Sevk Emirleri modal (detay) ── */

  const fetchCariSevkOrders = useCallback(async (cari: CariOzetRow, pageNum: number) => {
    if (!appliedFilters) return
    setCariSevkLoading(true)
    try {
      const seasonParam = appliedFilters.seasonCodes?.length ? appliedFilters.seasonCodes[0] : appliedFilters.season
      const params = new URLSearchParams({
        company: cari.company,
        customer: cari.currAccCode,
        fromDate: appliedFilters.fromDate,
        toDate: appliedFilters.toDate,
        season: seasonParam,
        contract: appliedFilters.contract ?? '',
        page: String(pageNum),
        pageSize: String(cariSevkPageSize),
      })
      if (appliedFilters.statusIds?.length) params.set('statusIds', appliedFilters.statusIds.join(','))
      if (appliedFilters.asnNo?.trim()) params.set('asnNo', appliedFilters.asnNo.trim())
      if (appliedFilters.orderNo?.trim()) params.set('orderNo', appliedFilters.orderNo.trim())
      const res = await api.get<{ rows?: DispOrder[]; totalCount?: number }>(`/api/finance/disp-orders?${params}`)
      setCariSevkOrders(Array.isArray(res?.rows) ? res.rows : [])
      setCariSevkTotalCount(typeof res?.totalCount === 'number' ? res.totalCount : 0)
    } catch {
      setCariSevkOrders([])
      setCariSevkTotalCount(0)
    } finally {
      setCariSevkLoading(false)
    }
  }, [appliedFilters, cariSevkPageSize])

  const openCariSevkModal = useCallback((row: CariOzetRow) => {
    setCariSevkModalCari(row)
    setCariSevkModalOpen(true)
    setCariSevkPage(1)
  }, [])

  const closeCariSevkModal = useCallback(() => {
    setCariSevkModalOpen(false)
    setCariSevkModalCari(null)
    setCariSevkOrders([])
    setCariSevkTotalCount(0)
    setCariSevkPage(1)
    setSelectedCariSevkIds(new Set())
    setCariSevkOzet(null)
  }, [])

  const fetchCariSevkOzet = useCallback(async (cari: CariOzetRow) => {
    if (!appliedFilters) return
    setCariSevkOzetLoading(true)
    try {
      const seasonParam = appliedFilters.seasonCodes?.length ? appliedFilters.seasonCodes[0] : appliedFilters.season
      const params = new URLSearchParams({
        company: cari.company,
        customer: cari.currAccCode,
        fromDate: appliedFilters.fromDate,
        toDate: appliedFilters.toDate,
        season: seasonParam ?? '',
        contract: appliedFilters.contract ?? '',
      })
      if (appliedFilters.statusIds?.length) params.set('statusIds', appliedFilters.statusIds.join(','))
      const res = await api.get<{
        unapprovedCount?: number
        unapprovedQty?: number
        unapprovedAmount?: number
        approvedCount?: number
        approvedQty?: number
        approvedAmount?: number
      }>(`/api/finance/cari-sevk-ozet?${params}`)
      setCariSevkOzet({
        unapprovedCount: Number(res?.unapprovedCount) || 0,
        unapprovedQty: Number(res?.unapprovedQty) || 0,
        unapprovedAmount: Number(res?.unapprovedAmount) || 0,
        approvedCount: Number(res?.approvedCount) || 0,
        approvedQty: Number(res?.approvedQty) || 0,
        approvedAmount: Number(res?.approvedAmount) || 0,
      })
    } catch {
      setCariSevkOzet(null)
    } finally {
      setCariSevkOzetLoading(false)
    }
  }, [appliedFilters])

  /* ── Cari Sevk modal: seçilen sevk emirlerine Onayla / Beklet / Sıfırla ── */

  const applyCariSevkAction = useCallback(async (statusId: number, waitReason?: string | null) => {
    if (selectedCariSevkIds.size === 0) return
    setSaving(true)
    setError('')
    try {
      const updates = Array.from(selectedCariSevkIds).map(id => ({
        dispOrderHeaderId: id,
        statusId,
        waitReason: waitReason ?? null,
      }))
      await api.put('/api/finance/disp-orders/approve', { updates })
      setSelectedCariSevkIds(new Set())
      setBekletModalOpen(false)
      setWaitReasonInput('')
      if (cariSevkModalCari && appliedFilters) {
        await fetchCariSevkOrders(cariSevkModalCari, cariSevkPage)
        await fetchCariSevkOzet(cariSevkModalCari)
        fetchGrid()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız.')
    } finally {
      setSaving(false)
    }
  }, [selectedCariSevkIds, cariSevkModalCari, cariSevkPage, appliedFilters, fetchCariSevkOrders, fetchCariSevkOzet, fetchGrid])

  applyCariSevkActionRef.current = applyCariSevkAction

  const toggleCariSevkSelection = useCallback((id: number) => {
    setSelectedCariSevkIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllCariSevkOrders = useCallback(() => {
    setSelectedCariSevkIds(prev =>
      prev.size === cariSevkOrders.length ? new Set() : new Set(cariSevkOrders.map(o => o.dispOrderHeaderId))
    )
  }, [cariSevkOrders])

  const selectedCariSevkCount = selectedCariSevkIds.size
  const allCariSevkSelected = cariSevkOrders.length > 0 && selectedCariSevkIds.size === cariSevkOrders.length

  const handleCariSevkOnayla = useCallback(() => applyCariSevkAction(2), [applyCariSevkAction])
  const handleCariSevkSifirla = useCallback(() => applyCariSevkAction(0), [applyCariSevkAction])
  const handleCariSevkBeklet = useCallback(() => {
    setBekletSource('cariSevk')
    setBekletModalOpen(true)
  }, [])

  useEffect(() => {
    if (cariSevkModalOpen && cariSevkModalCari && appliedFilters) {
      fetchCariSevkOrders(cariSevkModalCari, cariSevkPage)
      fetchCariSevkOzet(cariSevkModalCari)
    }
  }, [cariSevkModalOpen, cariSevkModalCari, cariSevkPage, appliedFilters, fetchCariSevkOrders, fetchCariSevkOzet])

  const cariSevkTotalPages = Math.max(1, Math.ceil(cariSevkTotalCount / cariSevkPageSize))

  /* ── Pagination ── */

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [page, totalPages])

  return {
    companies, customers, filterStatuses, actionStatuses, seasons, waitReasons,
    filters, setFilters, appliedFilters, search, resetFilters,
    cariOzet,
    totalCariCount,
    cariPage,
    setCariPage,
    cariPageSize,
    cariTotalPages,
    cariPageNumbers,
    selectedCariKeys,
    toggleCariSelection,
    selectAllCaris,
    clearCariSelection,
    selectedCariCount,
    allCarisSelected,
    handleCariOnayla,
    handleCariBeklet,
    handleCariSifirla,
    bekletModalOpen,
    confirmBeklet,
    cancelBeklet,
    rows, total, loading, error, page, setPage, totalPages, pageNumbers,
    selectedIds, toggleSelect, toggleSelectAll, allSelected,
    activeAction, waitReasonInput, setWaitReasonInput, saving,
    handleAction, confirmWait, cancelAction,
    detailOpen, detailLoading, detailOrder, detailLines, openDetail, closeDetail,
    customerSummaryOpen, customerSummaryLoading, customerSummary, openCustomerSummary, closeCustomerSummary,
    cariSevkModalOpen,
    cariSevkModalCari,
    cariSevkOrders,
    cariSevkLoading,
    cariSevkTotalCount,
    cariSevkPage,
    setCariSevkPage,
    cariSevkPageSize,
    cariSevkTotalPages,
    openCariSevkModal,
    closeCariSevkModal,
    cariSevkOzet,
    cariSevkOzetLoading,
    selectedCariSevkIds,
    toggleCariSevkSelection,
    selectAllCariSevkOrders,
    selectedCariSevkCount,
    allCariSevkSelected,
    handleCariSevkOnayla,
    handleCariSevkSifirla,
    handleCariSevkBeklet,
    visibleGridColumns,
    gridColumnOrder,
    gridColumnVisibility,
    setGridColumnOrder: setColumnOrder,
    setColumnVisible,
    allGridColumns: FINANS_ONAY_GRID_COLUMNS,
  }
}
