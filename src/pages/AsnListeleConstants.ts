/**
 * ASN Listele sayfası sabitleri.
 */

export const ISLEMI_YAPAN_OPTIONS = [{ id: '', label: '.. Hepsi ..' }]

export const DURUM_OPTIONS = [
  { id: '', label: '.. Hepsi ..' },
  { id: 'Onaylı', label: 'Onaylı' },
  { id: 'Taslak', label: 'Taslak' },
  { id: 'Alokasyon Bekliyor', label: 'Alokasyon Bekliyor' },
  { id: 'Alokasyon Yapılıyor', label: 'Alokasyon Yapılıyor' },
  { id: 'Alokasyon Yapıldı', label: 'Alokasyon Yapıldı' },
]

export const EVET_HAYIR_OPTIONS = [
  { id: '', label: '—' },
  { id: 'true', label: 'Evet' },
  { id: 'false', label: 'Hayır' },
]

export const GRID_COLUMNS = [
  { key: 'action', label: '#', filterType: 'none' as const },
  { key: 'no', label: 'No', filterType: 'text' as const },
  { key: 'firma', label: 'Firma', filterType: 'text' as const },
  { key: 'depoKodu', label: 'Depo Kodu', filterType: 'text' as const },
  { key: 'depoAdi', label: 'Depo Adı', filterType: 'text' as const },
  { key: 'saticiKodu', label: 'Satıcı Kodu', filterType: 'text' as const },
  { key: 'saticiAdi', label: 'Satıcı Adı', filterType: 'text' as const },
  { key: 'durum', label: 'Durum', filterType: 'select' as const },
  { key: 'ithDosyaNo', label: 'İth.Dosya No', filterType: 'text' as const },
  { key: 'islemdeMi', label: 'İşlemde mi?', filterType: 'select' as const },
  { key: 'asnNo', label: 'ASN No', filterType: 'text' as const },
  { key: 'dosyaAdi', label: 'Dosya Adı', filterType: 'text' as const },
  { key: 'aktarimZamani', label: 'Aktarım Zamanı', filterType: 'text' as const },
  { key: 'kullaniciAdi', label: 'Kullanıcı Adı', filterType: 'text' as const },
]

export const PAGE_SIZE = 10
export const EXCEL_PREVIEW_PAGE_SIZE = 10
export const EXCEL_PREVIEW_HEADERS = ['PackageNumber', 'PO Number', 'Barcode', 'Quantity']
