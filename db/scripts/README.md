# OrcaAlokasyon DB Scriptleri (Union referanslı)

Scriptleri **sırayla** çalıştırın. Veritabanı: `OrcaAlokasyon`.

| Sıra | Dosya | Açıklama |
|------|--------|----------|
| 01 | 01_Schemas.sql | `ext` şeması (ERP senkron tabloları için) |
| 02 | 02_Tables_Portal.sql | Inbound, InboundLine, InboundAsn, InboundAsnLine, InboundAsnCollected, ErrorLog |
| 02a | 02a_Tables_AsnRef.sql | InboundAsnCase, InboundAsnLineRef, InboundAsnLineSourceHeader, InboundAsnLineSource (ASN referans tabloları) |
| 03 | 03_Tables_Allocation.sql | Request, ReceivedOrder, ReferenceOrder, OpenOrder, NextOrder, DraftOrderHeader, DraftOrderLine |
| 04 | 04_Tables_Master.sql | cdCompany (tablo); cdWarehouse, Vendor, ChannelTemplate, cdChannelTemplate, cdChannelTemplateCustomer (view – ERP linked server, anlık sorgulama); prItemBarcode |
| 04c | 04c_Seed_Company.sql | cdCompany demo kayıtları (OLKA, MARLIN, JUPITER – şirket listesi boş kalmasın) |
| 04b | 04b_Tables_ExtSync.sql | ext.OrderHeader, ext.OrderLine, ext.ItemBarcode (view – ERP linked server, anlık sorgulama; OlkaB2BPortal view yapısına uyumlu) |
| 05 | 05_Views.sql | ReceivedOrderSummary, AllocationExcludedWarehouse, AllocationExceptionVendor |
| 06 | 06_Indexes.sql | İndeksler |
| 07 | 07_ErrorLog.sql | dbo.SaveErrorLog SP |
| 08 | 08_CreateRequest.sql | dbo.CreateRequest SP |
| 08a | 08a_AsnRef_Procedures.sql | FillInboundAsnCase, AllocateInboundAsnLineRef, AllocateInboundAsnLineSource SP'leri |
| 09 | 09_UpdateChannelTemplate.sql | dbo.UpdateChannelTemplate SP |
| 10 | 10_Allocation.sql | dbo.Allocation SP |
| 11 | 11_Tables_Queue.sql | Queue, QueueLog, QueueLogDetail (kuyruk tabloları) |
| 11c | 11c_Table_Priority.sql | Priority (öncelikli ASN), DispOrderLockCommand (IsLocked komut kuyruğu) |
| 12a | 12a_View_DraftOrder.sql | dbo.DraftOrder view (OrderJsonData, ReserveJsonData, DispOrderJsonData) |
| 12b | 12b_View_OrderAsnModel.sql | dbo.OrderAsnModel view (AsnJsonData) |
| 12 | 12_Views_List.sql | vw_InboundList, vw_AsnStatus, vw_OpenOrderSummary |
| 13 | 13_CreateQueueForAllocation.sql | dbo.CreateQueueForAllocation SP (DraftOrder view → Queue, tek cursor) |
| 14 | 14_CreateQueueForASN.sql | dbo.CreateQueueForASN SP (OrderAsnModel view → Queue, cursor) |
| 15 | 15_QueueProcess.sql | GetQueueList, InsertQueueLog, UpdateQueueLog, InsertQueueLogDetail, UpdateQueueOnSuccess/Failure, LogMaintenance, QueueLogCleanup, SetRequestCompletedIfAllDraftsComplete, ResetQueueForRetry, RefreshQueueJsonDataForDraftOrder |
| 15a | 15a_InsertOrdersReservationsDispOrders.sql | InsertOrders, InsertReservations, InsertDispOrders (QueueLogDetail.Response → DraftOrderHeader/DraftOrderLine) |
| 15c | 15c_SetDispOrderLock_CancelReceivedOrder.sql | SetDispOrderLock (DispOrderLockCommand), CancelReceivedOrder (stub – B2B/ERP ile tamamlanacak) |
| 15d | 15d_MissionAccomplished_Helpers.sql | MissionAccomplished_AfterOrder, MissionAccomplished_AfterReserve (IsLocked, CancelReceivedOrder mantığı) |
| 15b | 15b_MissionAccomplished.sql | MissionAccomplished SP (SuccessorScript; 4,5,6 için Insert + 15d helper çağrıları) |
| 23 | 23_SyncDispOrderFromErp.sql | SyncDispOrderFromErp, UpdateDispOrderLinePrice (ext'ten dbo.DispOrderHeader/Line güncelleme) |
| 23a | 23a_UpdateDispOrderHeaderCategorySeason.sql | UpdateDispOrderHeaderCategorySeason (set-based; Season/Category/Brand satırlardan header'a) |
| 24 | 24_ChangeTrack_UpdateReplenishment.sql | ChangeTrack, UpdateReplenishment (Union uyumlu: barcode doldurma, duplicate temizlik, ERP senkron, UpdateDispOrderLinePrice) |
| 25 | 25_DropOneTimeSPs.sql | Bir kerelik kullanılan SP'leri kaldırır (PatchQueueLogDetailResponse) |

**Bakım / fix script’lerinde kullanılan SP’ler (ürün akışında çağrılmaz):** BackfillDispOrderFromDraft, BackfillReserveLineIdsForDraftOrder, RefreshQueueJsonDataForDraftOrder, ResetQueueForRetry. İstenirse ileride kaldırılabilir.

**Not:** ext.OrderHeader, ext.OrderLine, ext.ItemBarcode artık **view**; ERP linked server (OlkaV3, MARLINV3 vb.) üzerinden anlık okunur. Synonym kullanılmaz; tüm referanslar doğrudan linked server adresiyle (`SERVER.dbo.tablo`) yapılır. Açık sipariş ön kontrolü (taslak kaydet) bu view'lardan SELECT ile yapılır. ext.OrderHeader ve 24_ChangeTrack doğrudan **dbo.cdWarehouse** kullanır (depo listesi ve IsBlocked filtresi). `dbo.AllocationExcludedWarehouse` ext.OrderHeader view'ında kullanılır; başlangıçta boş placeholder'dır, ileride doldurulmalıdır.
