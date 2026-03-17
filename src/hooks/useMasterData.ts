import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { api } from '../lib/api-client'
import { API_BASE } from '../config'

// ── Tipler ─────────────────────────────────────────────────

export type CompanyOption      = { companyCode: string; companyName: string }
export type CodeDescOption     = { code: string; description: string }
export type WarehouseOption    = { code: string; description: string; isDefault: boolean }

export interface AsnListFilters {
  firma?:       string
  depo?:        string
  satici?:      string
  baslangic?:   string
  bitis?:       string
  islemiYapan?: string
  durum?:       string
  page?:        number
  pageSize?:    number
}

export interface AsnListRow {
  id:            string
  no:            string
  firma:         string
  depoKodu:      string
  depoAdi:       string
  saticiKodu:    string
  saticiAdi:     string
  durum:         string
  ithDosyaNo:    string
  islemdeMi:     boolean
  asnNo:         string
  dosyaAdi:      string
  aktarimZamani: string
  kullaniciAdi:  string
}

export interface InboundLineRow {
  caseCode:  string
  poNo:      string
  eanCode:   string
  quantity:  number
}

// ── Helper ─────────────────────────────────────────────────

function buildUrl(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return API_BASE + base + (qs ? '?' + qs : '')
}

// ── Hooks ──────────────────────────────────────────────────

export function useCompanies() {
  return useQuery<CompanyOption[]>({
    queryKey: ['companies'],
    queryFn:  async () => {
      const res = await api.get<{ ok: boolean; rows: CompanyOption[] }>('/api/companies')
      return res.rows ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useWarehouses(companyCode: string | null, opts?: Partial<UseQueryOptions<WarehouseOption[]>>) {
  return useQuery<WarehouseOption[]>({
    queryKey: ['warehouses', companyCode],
    queryFn:  async () => {
      const res = await api.get<{ ok: boolean; rows: WarehouseOption[] }>(`/api/warehouses?company=${encodeURIComponent(companyCode ?? '')}`)
      return res.rows ?? []
    },
    enabled:   !!companyCode,
    staleTime: 10 * 60 * 1000,
    ...opts,
  })
}

export function useVendors(companyCode: string | null, opts?: Partial<UseQueryOptions<CodeDescOption[]>>) {
  return useQuery<CodeDescOption[]>({
    queryKey: ['vendors', companyCode],
    queryFn:  async () => {
      const res = await api.get<{ ok: boolean; rows: CodeDescOption[] }>(`/api/vendors?company=${encodeURIComponent(companyCode ?? '')}`)
      return res.rows ?? []
    },
    enabled:   !!companyCode,
    staleTime: 10 * 60 * 1000,
    ...opts,
  })
}

export function useChannelTemplates(companyCode: string | null, opts?: Partial<UseQueryOptions<CodeDescOption[]>>) {
  return useQuery<CodeDescOption[]>({
    queryKey: ['channel-templates', companyCode],
    queryFn:  async () => {
      const res = await api.get<{ ok: boolean; rows: CodeDescOption[] }>(`/api/channel-templates?company=${encodeURIComponent(companyCode ?? '')}`)
      return res.rows ?? []
    },
    enabled:   !!companyCode,
    staleTime: 10 * 60 * 1000,
    ...opts,
  })
}

export function useAsnList(filters: AsnListFilters, opts?: Partial<UseQueryOptions<{ rows: AsnListRow[]; totalCount: number }>>) {
  return useQuery<{ rows: AsnListRow[]; totalCount: number }>({
    queryKey: ['asn-list', filters],
    queryFn:  async () => {
      const url = buildUrl('/api/asn-list', { ...filters })
      const res = await api.get<{ ok: boolean; rows: AsnListRow[]; totalCount: number }>(url.replace(API_BASE, ''))
      return { rows: res.rows ?? [], totalCount: res.totalCount ?? 0 }
    },
    staleTime: 30 * 1000,
    ...opts,
  })
}

export function useInboundLines(inboundId: number | null, opts?: Partial<UseQueryOptions<InboundLineRow[]>>) {
  return useQuery<InboundLineRow[]>({
    queryKey: ['inbound-lines', inboundId],
    queryFn:  async () => {
      const res = await api.get<{ ok: boolean; rows: InboundLineRow[] }>(`/api/inbound/${inboundId}/lines`)
      return res.rows ?? []
    },
    enabled:   inboundId != null,
    staleTime: 60 * 1000,
    ...opts,
  })
}
