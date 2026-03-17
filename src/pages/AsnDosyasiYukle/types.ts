export type CompanyOption = { companyCode: string; companyName: string }

export type CodeDescriptionOption = { code: string; description: string }

export type WarehouseOption = { code: string; description: string; isDefault: boolean }

export type InsufficientBarcodeRow = {
  eanBarcode: string
  poNumber?: string
  openOrderQty: number
  loadedQty: number
  missingQty: number
  erpOrders?: { orderNumber: string; quantity: number }[]
  draftReservations?: { inboundId: number; quantity: number }[]
}
