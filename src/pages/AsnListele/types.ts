export type AsnRow = {
  id: string
  no: string
  firma: string
  depoKodu: string
  depoAdi: string
  saticiKodu: string
  saticiAdi: string
  durum: string
  ithDosyaNo: string
  islemdeMi: boolean
  asnNo: string
  dosyaAdi: string
  aktarimZamani: string
  kullaniciAdi: string
}

export type InsufficientBarcodeRow = {
  eanBarcode: string
  poNumber?: string
  openOrderQty: number
  loadedQty: number
  missingQty: number
  erpOrders?: { orderNumber: string; quantity: number }[]
  draftReservations?: { inboundId: number; quantity: number }[]
}

export type ExcelPreviewData = { headers: string[]; rows: unknown[][] }
