import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { StatusOption, SeasonOption, Filters } from './useFinansOnay'
import { COMPANY_LOGO_MAP } from '../AsnDosyasiYukle/constants'
import styles from './FinansOnay.module.css'

const CUSTOMER_PAGE_SIZE = 10

const COMPANY_COLORS: Record<string, string> = {
  OLKA: '#002b50',
  MARLIN: '#059669',
  JUPITER: '#7c3aed',
  NEPTUN: '#0284c7',
  SATURN: '#ea580c',
}

function CompanyLogo({ code, name, size = 28 }: { code: string; name: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false)
  const color = COMPANY_COLORS[code?.toUpperCase()] || '#64748b'
  const initial = (code || name || '?').charAt(0).toUpperCase()
  const logoUrl = code ? (COMPANY_LOGO_MAP[code] ?? COMPANY_LOGO_MAP[code?.toUpperCase()]) : ''

  if (code && logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt=""
        role="presentation"
        className={styles.companyLogoImg}
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    )
  }
  return (
    <span
      className={styles.companyLogo}
      style={{ backgroundColor: color, width: size, height: size, fontSize: size ? Math.round(size * 0.5) : 14 }}
    >
      {initial}
    </span>
  )
}

function CompanyDropdown({
  value,
  companies,
  onChange,
  className,
}: {
  value: string
  companies: { companyCode: string; companyName: string }[]
  onChange: (code: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const selected = value ? companies.find(c => c.companyCode === value) : null
  const displayLabel = selected ? selected.companyName : '.. Hepsi ..'

  return (
    <div className={[styles.companyDropdownWrap, className].filter(Boolean).join(' ')} ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.companyDropdownTrigger}>
          {value ? (
            <CompanyLogo code={value} name={selected?.companyName ?? ''} size={24} />
          ) : (
            <span className={styles.companyLogoPlaceholder} />
          )}
          <span className={styles.companyDropdownLabel}>{displayLabel}</span>
        </span>
        <span className={styles.companyDropdownArrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.companyDropdownList} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={styles.companyDropdownItem + (value === '' ? ' ' + styles.companyDropdownItemSelected : '')}
            onClick={() => { onChange(''); setOpen(false) }}
          >
            <span className={styles.companyLogoPlaceholder} />
            <span>.. Hepsi ..</span>
          </button>
          {(Array.isArray(companies) ? companies : []).map(c => (
            <button
              key={c.companyCode}
              type="button"
              role="option"
              aria-selected={value === c.companyCode}
              className={styles.companyDropdownItem + (value === c.companyCode ? ' ' + styles.companyDropdownItemSelected : '')}
              onClick={() => { onChange(c.companyCode); setOpen(false) }}
            >
              <CompanyLogo code={c.companyCode} name={c.companyName} size={28} />
              <span>{c.companyName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Müşteri dropdown – Tedarikçi ile aynı mantık: arama + Kod/Unvan tablo + sayfalama. Panel portal ile body'de render edilir, böylece grid/accordion kesmez. */
function CustomerDropdown({
  value,
  options,
  onChange,
  disabled,
  id,
}: {
  value: string
  options: { code: string; description: string }[]
  onChange: (code: string) => void
  disabled?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const portalContainer = typeof document !== 'undefined' ? document.getElementById('finans-musteri-portal') || document.body : null
  const updatePanelRect = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) {
      setPanelRect(null)
      return
    }
    updatePanelRect()
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', updatePanelRect, true)
    window.addEventListener('resize', updatePanelRect)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', updatePanelRect, true)
      window.removeEventListener('resize', updatePanelRect)
    }
  }, [open, updatePanelRect])

  useEffect(() => {
    if (open) {
      setPage(1)
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const searchLower = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      searchLower
        ? options.filter(
            (o) =>
              (o.code && o.code.toLowerCase().includes(searchLower)) ||
              (o.description && o.description.toLowerCase().includes(searchLower))
          )
        : options,
    [options, searchLower]
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / CUSTOMER_PAGE_SIZE))
  const pageStart = (Math.min(page, totalPages) - 1) * CUSTOMER_PAGE_SIZE
  const pageOptions = filtered.slice(pageStart, pageStart + CUSTOMER_PAGE_SIZE)

  const selectedLabel = value
    ? (options.find((o) => o.code === value)?.description || value)
    : '.. Hepsi ..'

  const panelContent = open && panelRect && (
    <div
      ref={panelRef}
      className={styles.vendorDropdownPanelPortal}
      style={{
        position: 'fixed',
        top: panelRect.top,
        left: panelRect.left,
        minWidth: panelRect.width,
        zIndex: 10000,
      }}
      role="listbox"
      aria-labelledby={id}
    >
      <div className={styles.vendorDropdownSearch}>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Kod veya unvan ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={styles.vendorSearchInput}
          aria-label="Müşteri ara"
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
              aria-selected={!value}
              className={styles.vendorDropdownRow}
              onClick={() => { onChange(''); setOpen(false) }}
            >
              <td className={styles.vendorDropdownTd}>—</td>
              <td className={styles.vendorDropdownTd}>.. Hepsi ..</td>
            </tr>
            {filtered.length === 0 && searchLower ? (
              <tr>
                <td colSpan={2} className={styles.vendorDropdownEmpty}>Sonuç bulunamadı</td>
              </tr>
            ) : (
              pageOptions.map((opt) => (
                <tr
                  key={opt.code}
                  role="option"
                  aria-selected={value === opt.code}
                  className={styles.vendorDropdownRow}
                  onClick={() => { onChange(opt.code); setOpen(false) }}
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
          Sayfa {page} / {totalPages} ({filtered.length} öğe)
        </span>
        <div className={styles.vendorDropdownPaginationBtns}>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage(1)} disabled={page <= 1} aria-label="İlk sayfa">«</button>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
            return (
              <button key={p} type="button" className={`${styles.vendorDropdownPageBtn} ${page === p ? styles.vendorDropdownPageBtnActive : ''}`} onClick={() => setPage(p)}>
                {p}
              </button>
            )
          })}
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Son sayfa">»</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className={styles.vendorDropdown} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={styles.vendorSelectTrigger}
        disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={styles.vendorSelectValue} title={selectedLabel}>
          {disabled ? 'Önce firma seçin' : selectedLabel}
        </span>
        <span className={styles.vendorSelectChevron} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {portalContainer && panelContent && createPortal(panelContent, portalContainer)}
    </div>
  )
}

/** Sezon dropdown – Müşteri ile aynı görünüm: arama + Kod/Unvan tablo + sayfalama; çoklu seçim (checkbox + Tamam). */
const SEASON_PAGE_SIZE = 10

function SeasonMultiDropdown({
  options,
  selectedCodes,
  onChange,
  disabled,
  id,
}: {
  options: { code: string; description: string }[]
  selectedCodes: string[]
  onChange: (codes: string[]) => void
  disabled?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [pendingSelection, setPendingSelection] = useState<string[]>([])

  const portalContainer = typeof document !== 'undefined' ? document.getElementById('finans-sezon-portal') || document.body : null
  const updatePanelRect = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) {
      setPanelRect(null)
      return
    }
    setPendingSelection(selectedCodes)
    updatePanelRect()
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', updatePanelRect, true)
    window.addEventListener('resize', updatePanelRect)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', updatePanelRect, true)
      window.removeEventListener('resize', updatePanelRect)
    }
  }, [open, updatePanelRect, selectedCodes])

  useEffect(() => {
    if (open) {
      setPage(1)
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const searchLower = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      searchLower
        ? options.filter(
            (o) =>
              (o.code && o.code.toLowerCase().includes(searchLower)) ||
              (o.description && o.description.toLowerCase().includes(searchLower))
          )
        : options,
    [options, searchLower]
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / SEASON_PAGE_SIZE))
  const pageStart = (Math.min(page, totalPages) - 1) * SEASON_PAGE_SIZE
  const pageOptions = filtered.slice(pageStart, pageStart + SEASON_PAGE_SIZE)

  const allSelected = filtered.length > 0 && filtered.every((o) => pendingSelection.includes(o.code))
  const toggleAll = () => {
    if (allSelected) setPendingSelection((prev) => prev.filter((c) => !filtered.some((f) => f.code === c)))
    else setPendingSelection((prev) => [...new Set([...prev, ...filtered.map((o) => o.code)])])
  }
  const toggle = (code: string) => {
    setPendingSelection((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }
  const applyAndClose = () => {
    onChange(pendingSelection)
    setOpen(false)
  }

  const label =
    selectedCodes.length === 0
      ? '.. Hepsi ..'
      : selectedCodes.length === options.length
        ? 'Tümü seçili'
        : `${selectedCodes.length} sezon seçili`

  const panelContent = open && panelRect && (
    <div
      ref={panelRef}
      className={styles.vendorDropdownPanelPortal}
      style={{
        position: 'fixed',
        top: panelRect.top,
        left: panelRect.left,
        minWidth: panelRect.width,
        zIndex: 10000,
      }}
      role="listbox"
      aria-labelledby={id}
      aria-multiselectable="true"
    >
      <div className={styles.vendorDropdownSearch}>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Kod veya unvan ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={styles.vendorSearchInput}
          aria-label="Sezon ara"
        />
      </div>
      <div className={styles.vendorDropdownTableWrap}>
        <table className={styles.vendorDropdownTable}>
          <thead>
            <tr>
              <th className={styles.vendorDropdownTh} style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Tümünü seç"
                />
              </th>
              <th className={styles.vendorDropdownTh}>Kod</th>
              <th className={styles.vendorDropdownTh}>Unvan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && searchLower ? (
              <tr>
                <td colSpan={3} className={styles.vendorDropdownEmpty}>Sonuç bulunamadı</td>
              </tr>
            ) : (
              pageOptions.map((opt) => (
                <tr
                  key={opt.code}
                  role="option"
                  aria-selected={pendingSelection.includes(opt.code)}
                  className={styles.vendorDropdownRow}
                  onClick={() => toggle(opt.code)}
                >
                  <td className={styles.vendorDropdownTd} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={pendingSelection.includes(opt.code)}
                      onChange={() => toggle(opt.code)}
                      aria-label={opt.code}
                    />
                  </td>
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
          Sayfa {page} / {totalPages} ({filtered.length} öğe)
        </span>
        <div className={styles.vendorDropdownPaginationBtns}>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage(1)} disabled={page <= 1} aria-label="İlk sayfa">«</button>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
            return (
              <button key={p} type="button" className={`${styles.vendorDropdownPageBtn} ${page === p ? styles.vendorDropdownPageBtnActive : ''}`} onClick={() => setPage(p)}>
                {p}
              </button>
            )
          })}
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
          <button type="button" className={styles.vendorDropdownPageBtn} onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Son sayfa">»</button>
        </div>
      </div>
      <div className={styles.seasonMultiFooter}>
        <button type="button" className={styles.filterBtnPrimary} onClick={applyAndClose}>
          Tamam
        </button>
      </div>
    </div>
  )

  return (
    <div className={styles.vendorDropdown} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable="true"
        className={styles.vendorSelectTrigger}
        disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={styles.vendorSelectValue} title={label}>
          {disabled ? 'Önce firma seçin' : label}
        </span>
        <span className={styles.vendorSelectChevron} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {portalContainer && panelContent && createPortal(panelContent, portalContainer)}
    </div>
  )
}

/** Durum dropdown – çoklu seçim (DispOrderStatus). */
function StatusDropdown({
  statuses,
  selectedIds,
  onChange,
}: {
  statuses: StatusOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const allSelected = statuses.length > 0 && selectedIds.length === statuses.length
  const noneSelected = selectedIds.length === 0

  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(statuses.map(s => s.id))
  }

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id))
    else onChange([...selectedIds, id])
  }

  const label = noneSelected
    ? 'Hepsi'
    : allSelected
      ? 'Tümü seçili'
      : `${selectedIds.length} durum seçili`

  return (
    <div className={styles.vendorDropdown} ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={styles.vendorSelectTrigger}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(v => !v)}
      >
        <span className={styles.vendorSelectValue}>{label}</span>
        <span className={styles.vendorSelectChevron} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.seasonDropdownPanel}>
          <label className={styles.seasonDropdownItem}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>Tümünü Seç</span>
          </label>
          <div className={styles.seasonDropdownList}>
            {statuses.length === 0
              ? <span className={styles.vendorDropdownEmpty}>Durum listesi yok</span>
              : statuses.map(s => (
                  <label key={s.id} className={styles.seasonDropdownItem}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    <span>{s.name}</span>
                  </label>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

/** Sözleşme: ext.Customer.Contract = "Yok" ise Yok, aksi halde Var */
const CONTRACT_OPTIONS = [
  { value: '', label: 'Hepsi' },
  { value: 'Var', label: 'Var' },
  { value: 'Yok', label: 'Yok' },
]

/** Tek değer input + çoklu giriş modali (virgülle ayrılmış; maxCount ile sınır). */
function MultiValueInput({
  value,
  onChange,
  placeholder,
  modalTitle,
  maxCount,
  inputLabel,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  modalTitle: string
  maxCount: number
  inputLabel?: string
  className?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const openModal = () => {
    setDraft(value || '')
    setModalOpen(true)
  }

  const applyModal = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean).slice(0, maxCount)
    onChange(parts.join(', '))
    setModalOpen(false)
  }

  return (
    <div className={styles.multiValueInputWrap}>
      <div className={styles.multiValueInputInner}>
        <input
          type="text"
          className={className ?? styles.filterInputModern}
          placeholder={placeholder}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).form?.requestSubmit()}
          aria-label={inputLabel ?? placeholder}
        />
        <button
          type="button"
          className={styles.multiValueInputIconBtn}
          onClick={openModal}
          title={modalTitle + ' (virgülle ayırarak en fazla ' + maxCount + ' adet)'}
          aria-label="Çoklu giriş"
        >
          <span aria-hidden>📋</span>
        </button>
      </div>
      {modalOpen && (
        <div className={styles.multiValueModalBackdrop} onClick={() => setModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="multi-value-modal-title">
          <div className={styles.multiValueModal} onClick={(e) => e.stopPropagation()}>
            <h2 id="multi-value-modal-title" className={styles.multiValueModalTitle}>{modalTitle}</h2>
            <p className={styles.multiValueModalHint}>
              Virgülle ayırarak yazın (en fazla {maxCount} adet).
            </p>
            <textarea
              className={styles.multiValueModalTextarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={maxCount <= 10 ? 4 : 8}
              placeholder="Örn: A001, A002, A003"
              aria-label="Değerler (virgülle ayrılmış)"
            />
            <div className={styles.multiValueModalFooter}>
              <button type="button" className={styles.filterBtnSecondary} onClick={() => setModalOpen(false)}>
                İptal
              </button>
              <button type="button" className={styles.filterBtnPrimary} onClick={applyModal}>
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  companies: { companyCode: string; companyName: string }[]
  customers: { code: string; description: string }[]
  filterStatuses: StatusOption[]
  seasons: SeasonOption[]
  contractOptions?: { value: string; label: string }[]
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onSearch: () => void
  onReset?: () => void
  loading: boolean
}

export function FilterBar({
  companies,
  customers = [],
  filterStatuses,
  seasons,
  contractOptions = CONTRACT_OPTIONS,
  filters,
  onChange,
  onSearch,
  onReset,
  loading,
}: Props) {

  const actions = (
    <div className={styles.filterActions}>
      <button
        type="button"
        className={styles.filterBtnPrimary}
        onClick={onSearch}
        disabled={loading}
      >
        {loading ? <span className={styles.spinner} /> : null}
        <span className={styles.filterBtnIcon}>🔍</span>
        Sorgula
      </button>
      <button type="button" className={styles.filterBtnSecondary} onClick={onReset}>
        <span className={styles.filterBtnIcon}>✕</span>
        Vazgeç
      </button>
    </div>
  )

  const row1 = (
    <div className={styles.filterGridRow1 + ' ' + styles.filterGridRow}>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Firma</label>
        <CompanyDropdown
          value={filters.company}
          companies={companies}
          onChange={(code) => onChange({ company: code, customer: '' })}
        />
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Müşteri</label>
        <CustomerDropdown
          id="finans-musteri-select"
          value={filters.customer}
          options={customers}
          onChange={(code) => onChange({ customer: code })}
          disabled={!filters.company}
        />
      </div>
      <div className={styles.filterRow + ' ' + styles.filterRowNarrow}>
        <label className={styles.filterLabel}>Durum</label>
        <StatusDropdown
          statuses={Array.isArray(filterStatuses) ? filterStatuses : []}
          selectedIds={filters.statusIds ?? []}
          onChange={(ids) => onChange({ statusIds: ids })}
        />
      </div>
      <div className={styles.filterRow + ' ' + styles.filterRowNarrow}>
        <label className={styles.filterLabel}>Sözleşme</label>
        <select
          className={styles.filterSelectModern}
          value={filters.contract ?? ''}
          onChange={(e) => onChange({ contract: e.target.value })}
        >
          {(contractOptions || CONTRACT_OPTIONS).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Sezon</label>
        <SeasonMultiDropdown
          id="finans-sezon-select"
          options={Array.isArray(seasons) ? seasons : []}
          selectedCodes={filters.seasonCodes || []}
          onChange={(codes) => onChange({ seasonCodes: codes })}
          disabled={!filters.company}
        />
      </div>
    </div>
  )

  const row2 = (
    <div className={styles.filterGridRow2 + ' ' + styles.filterGridRow}>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Tarih</label>
        <div className={styles.dateRange}>
          <input
            type="date"
            className={styles.filterInputModern}
            value={filters.fromDate}
            onChange={(e) => onChange({ fromDate: e.target.value })}
          />
          <input
            type="date"
            className={styles.filterInputModern}
            value={filters.toDate}
            onChange={(e) => onChange({ toDate: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>ASN No</label>
        <MultiValueInput
          value={filters.asnNo || ''}
          onChange={(v) => onChange({ asnNo: v })}
          placeholder="ASN numarası"
          modalTitle="Çoklu ASN No"
          maxCount={10}
          inputLabel="ASN numarası"
        />
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Limit Tutar</label>
        <input
          type="number"
          min={0}
          step={1}
          className={styles.filterSpinner}
          value={filters.limitAmount ?? 0}
          onChange={(e) => onChange({ limitAmount: Number(e.target.value) || 0 })}
        />
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel}>Sevk Emri No</label>
        <MultiValueInput
          value={filters.orderNo || ''}
          onChange={(v) => onChange({ orderNo: v })}
          placeholder="Sevk emri no"
          modalTitle="Çoklu Sevk Emri No"
          maxCount={300}
          inputLabel="Sevk emri no"
        />
      </div>
    </div>
  )

  return (
    <div className={styles.filterPanel}>
      <div className={styles.filterTwoRows}>
        {row1}
        {row2}
      </div>
      <div className={styles.filterActionsRow}>
        {actions}
      </div>
    </div>
  )
}
