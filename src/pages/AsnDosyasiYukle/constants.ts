/** ASN Excel'de olması gereken sütunlar (sırayla). Her biri için alternatif isimler desteklenir. */
export const COLUMN_ALIASES: [string, string[]][] = [
  ['PackageNumber', ['PackageNumber', 'Package Number', 'CaseCode', 'Case Code']],
  ['PO Number', ['PO Number', 'PONumber', 'PO No', 'Purchase Order', 'PoNo']],
  ['Barcode', ['Barcode', 'EANCode', 'EAN']],
  ['Quantity', ['Quantity', 'Qty', 'TotalPairsBySku']],
]

export const MAX_PREVIEW_ROWS = 100

export const ASN_TEMPLATE_FILE_NAME = 'ASNFileFormat.xlsx'

/** Şirket logoları – cdCompany'de yoksa bu map kullanılır (companyCode -> public path). */
export const COMPANY_LOGO_MAP: Record<string, string> = {
  OLKA: '/logo/Skechers.png',
  MARLIN: '/logo/Asics.png',
  JUPITER: '/logo/Jupiter.jpg',
  NEPTUN: '/logo/Neptun.jpg',
  SATURN: '/logo/Saturn.jpg',
}
