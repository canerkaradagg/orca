import { useCallback, useState, useRef, useEffect } from 'react'
import styles from './FinansOnay.module.css'
import { useFinansOnay, type CariOzetRow } from './useFinansOnay'
import { FilterBar } from './FilterBar'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_CLASS: Record<number, string> = {
  0: styles.badgeGray,
  1: styles.badgeOrange,
  2: styles.badgeGreen,
  3: styles.badgeBlue,
  4: styles.badgePurple,
}

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('tr-TR')
}

function fmtMoney(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


export function FinansOnay() {
  const { user } = useAuth()
  const h = useFinansOnay(user?.userId)
  const [filterOpen, setFilterOpen] = useState(true)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const columnMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!columnMenuOpen) return
    const close = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setColumnMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [columnMenuOpen])

  const handleFilterChange = useCallback(
    (patch: Partial<typeof h.filters>) => h.setFilters(f => ({ ...f, ...patch })),
    [h.setFilters],
  )

  const getCariCell = useCallback((row: CariOzetRow, field: keyof CariOzetRow): React.ReactNode => {
    const v = row[field]
    if (v == null || v === '') return '—'
    if (field === 'baseAmount' || field === 'totalAmount' || field === 'amountApproved' || field === 'amountApprovedNew' || field === 'amountApprovedDiff') return fmtMoney(Number(v))
    if (field === 'dispCount') return Number(v).toLocaleString('tr-TR')
    return String(v)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Finans Onay</h1>
        <p className={styles.subtitle}>Sevk emirlerini görüntüleyin ve onay durumlarını yönetin.</p>
      </div>

      <div className={styles.accordion}>
        <section className={styles.accordionItem}>
          <button
            type="button"
            className={`${styles.accordionHeader} ${filterOpen ? styles.accordionHeaderOpen : ''}`}
            onClick={() => setFilterOpen(v => !v)}
            aria-expanded={filterOpen}
          >
            <span className={styles.accordionStepNum}>1</span>
            <span className={styles.accordionTitle}>Filtreler</span>
            <span className={styles.accordionChevron} aria-hidden>›</span>
          </button>
          <div className={`${styles.accordionContent} ${filterOpen ? styles.accordionContentOpen : ''}`}>
            <FilterBar
              companies={h.companies}
              customers={h.customers}
              filterStatuses={h.filterStatuses}
              seasons={h.seasons}
              filters={h.filters}
              onChange={handleFilterChange}
              onSearch={h.search}
              onReset={h.resetFilters}
              loading={h.loading}
            />
          </div>
        </section>
      </div>

      <div className={styles.mainContent}>
        {h.error && <div className={styles.errorMsg}>{h.error}</div>}
        <div className={styles.section}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thCheck}>
                    <input
                      type="checkbox"
                      checked={h.allCarisSelected}
                      onChange={h.selectAllCaris}
                      disabled={h.cariOzet.length === 0}
                      title="Tümünü seç / kaldır"
                    />
                  </th>
                  <th>Şirket</th>
                  <th>Müşteri Kodu</th>
                  <th>Müşteri Adı</th>
                  <th className={styles.thCenter}>Sevk Emri Sayısı</th>
                  <th className={styles.thCenter}>PSF Tutar</th>
                  <th className={styles.thCenter}>Fatura Tutarı</th>
                  <th className={styles.thCenter}>Tutar(Sevk)</th>
                  <th className={styles.thCenter}>Yeni Tutar(Sevk)</th>
                  <th className={styles.thCenter}>Fark Tutar(Sevk)</th>
                  <th>Bekletme nedeni</th>
                </tr>
              </thead>
              <tbody>
                {h.loading && h.cariOzet.length === 0 ? (
                  <tr><td colSpan={11} className={styles.emptyCell}><span className={styles.spinner} /> Yükleniyor...</td></tr>
                ) : h.cariOzet.length === 0 ? (
                  <tr>
                    <td colSpan={11} className={styles.emptyCell}>
                      {h.appliedFilters ? 'Kayıt bulunamadı.' : 'Filtreleri seçip Sorgula\'ya tıklayın.'}
                    </td>
                  </tr>
                ) : (
                  h.cariOzet.map(row => {
                    const cariKey = `${row.company}|${row.currAccCode}`
                    const isSelected = h.selectedCariKeys.has(cariKey)
                    const isBeklet = row.hasBeklet === true
                    const isOnayli = row.hasAllOnayli === true
                    const rowTitle = isBeklet && row.waitReasonSample ? row.waitReasonSample : undefined
                    return (
                      <tr
                        key={cariKey}
                        className={[
                          isSelected ? styles.rowSelected : '',
                          isOnayli ? styles.rowOnayli : '',
                          isBeklet ? styles.rowBeklet : '',
                        ].filter(Boolean).join(' ')}
                        title={rowTitle}
                        onClick={() => h.toggleCariSelection(row)}
                      >
                        <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => h.toggleCariSelection(row)}
                          />
                        </td>
                        <td>{getCariCell(row, 'company')}</td>
                        <td
                          className={`${styles.cellBold} ${styles.cariDetailLink}`}
                          onClick={e => { e.stopPropagation(); h.openCariSevkModal(row) }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); h.openCariSevkModal(row) } }}
                        >
                          {getCariCell(row, 'currAccCode')}
                        </td>
                        <td
                          className={styles.cariDetailLink}
                          onClick={e => { e.stopPropagation(); h.openCariSevkModal(row) }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); h.openCariSevkModal(row) } }}
                        >
                          {getCariCell(row, 'currAccDescription')}
                        </td>
                        <td className={styles.tdCenter}>{getCariCell(row, 'dispCount')}</td>
                        <td className={styles.tdCenter}>{getCariCell(row, 'baseAmount')}</td>
                        <td className={styles.tdCenter}>{getCariCell(row, 'totalAmount')}</td>
                        <td className={styles.tdCenter}>{getCariCell(row, 'amountApproved')}</td>
                        <td className={styles.tdCenter}>{getCariCell(row, 'amountApprovedNew')}</td>
                        <td className={`${styles.tdCenter} ${row.amountApprovedDiff !== 0 ? styles.amountDiff : ''}`}>{getCariCell(row, 'amountApprovedDiff')}</td>
                        <td className={styles.tdReason}>{isBeklet ? (row.waitReasonSample || 'Beklet') : '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {h.totalCariCount > 0 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>
                Toplam {h.totalCariCount} cari — Sayfa {h.cariPage} / {h.cariTotalPages}
              </span>
              <div className={styles.pageButtons}>
                <button type="button" className={styles.pageBtn} onClick={() => h.setCariPage(1)} disabled={h.cariPage <= 1}>
                  İlk
                </button>
                <button type="button" className={styles.pageBtn} onClick={() => h.setCariPage(h.cariPage - 1)} disabled={h.cariPage <= 1}>
                  Önceki
                </button>
                {h.cariPageNumbers.map((n) => (
                  <button key={n} type="button" className={n === h.cariPage ? `${styles.pageBtn} ${styles.pageBtnActive}` : styles.pageBtn} onClick={() => h.setCariPage(n)} disabled={n === h.cariPage}>
                    {n}
                  </button>
                ))}
                <button type="button" className={styles.pageBtn} onClick={() => h.setCariPage(h.cariPage + 1)} disabled={h.cariPage >= h.cariTotalPages}>
                  Sonraki
                </button>
                <button type="button" className={styles.pageBtn} onClick={() => h.setCariPage(h.cariTotalPages)} disabled={h.cariPage >= h.cariTotalPages}>
                  Son
                </button>
              </div>
            </div>
          )}

          {h.selectedCariCount > 0 && (
            <div className={styles.actionBar}>
              <span className={styles.actionInfo}>{h.selectedCariCount} cari seçili</span>
              <div className={styles.cariSevkCircleBtns}>
                <div className={styles.cariSevkCircleBtnWrap}>
                  <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnSifirla}`} onClick={h.handleCariSifirla} disabled={h.saving} title="Sıfırla" aria-label="Sıfırla">
                    <span className={styles.cariSevkResetIcon} aria-hidden>🔄</span>
                  </button>
                  <span className={styles.cariSevkCircleBtnLabel}>Sıfırla</span>
                </div>
                <div className={styles.cariSevkCircleBtnWrap}>
                  <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnBeklet}`} onClick={h.handleCariBeklet} disabled={h.saving} title="Beklet" aria-label="Beklet">
                    ✋
                  </button>
                  <span className={styles.cariSevkCircleBtnLabel}>Beklet</span>
                </div>
                <div className={styles.cariSevkCircleBtnWrap}>
                  <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnOnayla}`} onClick={h.handleCariOnayla} disabled={h.saving} title="Onayla" aria-label="Onayla">
                    {h.saving ? <span className={styles.spinner} /> : '🚚'}
                  </button>
                  <span className={styles.cariSevkCircleBtnLabel}>Onayla</span>
                </div>
              </div>
            </div>
          )}
        </div>

          {/* Beklet modal */}
          {h.bekletModalOpen && (
            <div className={`${styles.overlay} ${styles.overlayStacked}`} onClick={h.cancelBeklet}>
              <div className={styles.modalSmall} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>Bekletme gerekçesi</h2>
                  <button className={styles.modalClose} onClick={h.cancelBeklet}>×</button>
                </div>
                <div className={styles.modalBody}>
                  <p className={styles.modalDesc}>Seçili kayıtlar bekletilecek. Lütfen gerekçe seçin.</p>
                  <select
                    className={styles.waitReasonSelect}
                    value={h.waitReasonInput}
                    onChange={e => h.setWaitReasonInput(e.target.value)}
                  >
                    <option value="">Bekleme nedeni seçin...</option>
                    {h.waitReasons.map(r => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </select>
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.confirmBtn} onClick={h.confirmBeklet} disabled={h.saving || !h.waitReasonInput}>
                      {h.saving ? <span className={styles.spinner} /> : 'Kaydet'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={h.cancelBeklet} disabled={h.saving}>
                      İptal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detail modal */}
          {h.detailOpen && h.detailOrder && (
        <div className={styles.overlay} onClick={h.closeDetail}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                Sevk Detayı — {h.detailOrder.dispOrderNo}
              </h2>
              <button className={styles.modalClose} onClick={h.closeDetail}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailMeta}>
                <span><strong>Cari:</strong> {h.detailOrder.customerCode} — {h.detailOrder.customerName}</span>
                <span><strong>Tarih:</strong> {fmtDate(h.detailOrder.orderDate)}</span>
                <span><strong>Depo:</strong> {h.detailOrder.warehouseName}</span>
              </div>
              {h.detailLoading ? (
                <div className={styles.emptyCell}><span className={styles.spinner} /> Yükleniyor...</div>
              ) : (
                <div className={styles.detailTableWrap}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Ürün Kodu</th>
                        <th>Ürün Adı</th>
                        <th className={styles.thRight}>Adet</th>
                        <th className={styles.thRight}>Birim Fiyat</th>
                        <th className={styles.thRight}>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.detailLines.length === 0 ? (
                        <tr><td colSpan={6} className={styles.emptyCell}>Satır bulunamadı.</td></tr>
                      ) : (
                        h.detailLines.map(line => (
                          <tr key={line.lineNo}>
                            <td>{line.lineNo}</td>
                            <td className={styles.cellBold}>{line.itemCode}</td>
                            <td>{line.itemName}</td>
                            <td className={styles.tdRight}>{line.qty}</td>
                            <td className={styles.tdRight}>{fmtMoney(line.unitPrice)}</td>
                            <td className={styles.tdRight}>{fmtMoney(line.lineTotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          </div>
          )}

          {/* Customer summary modal */}
          {h.customerSummaryOpen && (
        <div className={`${styles.overlay} ${styles.overlayStacked}`} onClick={h.closeCustomerSummary}>
          <div className={styles.modalSmall} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Cari Finans Özeti</h2>
              <button className={styles.modalClose} onClick={h.closeCustomerSummary}>×</button>
            </div>
            <div className={styles.modalBody}>
              {h.customerSummaryLoading ? (
                <div className={styles.emptyCell}><span className={styles.spinner} /> Yükleniyor...</div>
              ) : !h.customerSummary ? (
                <div className={styles.emptyCell}>Bilgi alınamadı.</div>
              ) : (
                <dl className={styles.summaryGrid}>
                  <div className={styles.summaryItem}>
                    <dt>Cari Kodu</dt>
                    <dd>{h.customerSummary.customerCode}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Cari Adı</dt>
                    <dd>{h.customerSummary.customerName || '—'}</dd>
                  </div>
                  {(h.customerSummary.workingMethod || h.customerSummary.workingMethodCode) && (
                    <>
                      {h.customerSummary.workingMethodCode && (
                        <div className={styles.summaryItem}>
                          <dt>Çalışma Yöntemi Kodu</dt>
                          <dd>{h.customerSummary.workingMethodCode}</dd>
                        </div>
                      )}
                      {h.customerSummary.workingMethod && (
                        <div className={styles.summaryItem}>
                          <dt>Çalışma Yöntemi</dt>
                          <dd>{h.customerSummary.workingMethod}</dd>
                        </div>
                      )}
                    </>
                  )}
                  <div className={styles.summaryItem}>
                    <dt>Vade (Ödeme Süresi)</dt>
                    <dd>{h.customerSummary.avgPaymentDays} gün</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Kredi Limiti</dt>
                    <dd>{fmtMoney(h.customerSummary.creditLimit)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Bakiye</dt>
                    <dd>{fmtMoney(h.customerSummary.balance)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Kalan Sipariş Bakiyesi</dt>
                    <dd>{fmtMoney(h.customerSummary.kalanSiparisBakiyesi ?? 0)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Kullanılabilir Kredi</dt>
                    <dd className={h.customerSummary.availableCredit < 0 ? styles.negative : styles.positive}>
                      {fmtMoney(h.customerSummary.availableCredit)}
                    </dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Risk / Teminat Riski</dt>
                    <dd>{fmtMoney(h.customerSummary.risk)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Teminat Mektubu Tutarı</dt>
                    <dd>{fmtMoney(h.customerSummary.teminatMektubuTutari ?? 0)}</dd>
                  </div>
                  {h.customerSummary.letterOfGuaranteeEarliestDue && h.customerSummary.letterOfGuaranteeEarliestDue !== '1900-01-01' && (
                    <div className={styles.summaryItem}>
                      <dt>Teminat Mektubu En Erken Vade</dt>
                      <dd>{h.customerSummary.letterOfGuaranteeEarliestDue}</dd>
                    </div>
                  )}
                  <div className={styles.summaryItem}>
                    <dt>Vadesi Geçmiş</dt>
                    <dd className={h.customerSummary.overdueAmount > 0 ? styles.negative : ''}>
                      {fmtMoney(h.customerSummary.overdueAmount)}
                    </dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Alınan Çek (Aktif Sezon)</dt>
                    <dd>{fmtMoney(h.customerSummary.alinanCekAktifSezon ?? 0)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Alınan Çek (Eski Sezon)</dt>
                    <dd>{fmtMoney(h.customerSummary.alinanCekEskiezon ?? 0)}</dd>
                  </div>
                  <div className={styles.summaryItem}>
                    <dt>Sevkiyat Teminat</dt>
                    <dd>{fmtMoney(h.customerSummary.sevkiyatTemin ?? 0)}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        </div>
          )}

          {/* Sevk Emirleri modal (cari detay) */}
          {h.cariSevkModalOpen && h.cariSevkModalCari && (
            <div className={styles.overlay} onClick={h.closeCariSevkModal}>
              <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>Sevk Emirleri</h2>
                  <button className={styles.modalClose} onClick={h.closeCariSevkModal}>×</button>
                </div>
                <div className={styles.modalBody} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <div className={styles.cariSevkModalTop}>
                    <div className={styles.cariSevkModalInfo}>
                      <div className={styles.cariSevkModalInfoRow}>
                        <span className={styles.cariSevkModalInfoLabel}>Firma:</span>
                        <span className={styles.cariSevkModalInfoValue}>{h.cariSevkModalCari.company}</span>
                      </div>
                      <div className={styles.cariSevkModalInfoRow}>
                        <span className={styles.cariSevkModalInfoLabel}>Müşteri Kodu:</span>
                        <span className={styles.cariSevkModalInfoValue}>{h.cariSevkModalCari.currAccCode}</span>
                      </div>
                      <div className={styles.cariSevkModalInfoRow}>
                        <span className={styles.cariSevkModalInfoLabel}>Müşteri:</span>
                        <span className={styles.cariSevkModalInfoValue}>{h.cariSevkModalCari.currAccDescription}</span>
                      </div>
                      <div className={styles.cariSevkModalInfoRow}>
                        <span className={styles.cariSevkModalInfoLabel}>Faturalanmamış Tutar:</span>
                        <span className={styles.cariSevkModalInfoValue}>
                          {fmtMoney(
                            h.cariSevkOzet
                              ? h.cariSevkOzet.approvedAmount
                              : (h.cariSevkModalCari?.totalAmount ?? 0)
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`${styles.cariSummaryBtn} ${styles.cariSummaryBtnSmall}`}
                        onClick={() => { h.openCustomerSummary(h.cariSevkModalCari!.currAccCode, h.cariSevkModalCari!.company) }}
                        title="Cari bakiye ve kredi özeti"
                      >
                        <span className={styles.cariSummaryBtnIcon} aria-hidden>📋</span>
                        Cari Hesap Özeti
                      </button>
                    </div>
                    {(() => {
                      const cari = h.cariSevkModalCari
                      const ozet = h.cariSevkOzet
                      const totalAmount = ozet ? ozet.unapprovedAmount + ozet.approvedAmount : cari.totalAmount
                      const totalCount = ozet ? ozet.unapprovedCount + ozet.approvedCount : 0
                      const totalQty = ozet ? ozet.unapprovedQty + ozet.approvedQty : 0
                      return (
                        <>
                          <div className={styles.cariSevkModalCenter}>
                            <div className={styles.cariSevkSummaryBoxes}>
                              <div className={styles.cariSevkSummaryBox}>
                                <div className={styles.cariSevkSummaryBoxTitle}>Onaylanmamış</div>
                                <div className={styles.cariSevkSummaryBoxBody}>
                                  {h.cariSevkOzetLoading ? (
                                    <span className={styles.spinner} />
                                  ) : ozet ? (
                                    <>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Adet</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{ozet.unapprovedCount.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Miktar</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{ozet.unapprovedQty.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Fatura Tutarı</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{fmtMoney(ozet.unapprovedAmount)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </div>
                              </div>
                              <div className={`${styles.cariSevkSummaryBox} ${styles.cariSevkSummaryBoxGreen}`}>
                                <div className={styles.cariSevkSummaryBoxTitle}>Onaylanmış</div>
                                <div className={styles.cariSevkSummaryBoxBody}>
                                  {h.cariSevkOzetLoading ? (
                                    <span className={styles.spinner} />
                                  ) : ozet ? (
                                    <>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Adet</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{ozet.approvedCount.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Miktar</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{ozet.approvedQty.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Fatura Tutarı</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{fmtMoney(ozet.approvedAmount)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </div>
                              </div>
                              <div className={styles.cariSevkSummaryBox}>
                                <div className={styles.cariSevkSummaryBoxTitle}>Genel Toplam</div>
                                <div className={styles.cariSevkSummaryBoxBody}>
                                  {h.cariSevkOzetLoading ? (
                                    <span className={styles.spinner} />
                                  ) : ozet ? (
                                    <>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Adet</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{totalCount.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Miktar</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{totalQty.toLocaleString('tr-TR')}</span>
                                      </div>
                                      <div className={styles.cariSevkSummaryBoxRow}>
                                        <span className={styles.cariSevkSummaryBoxLabel}>Fatura Tutarı</span>
                                        <span className={styles.cariSevkSummaryBoxValue}>{fmtMoney(totalAmount)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                  {h.cariSevkLoading && h.cariSevkOrders.length === 0 ? (
                    <div className={styles.emptyCell}><span className={styles.spinner} /> Yükleniyor...</div>
                  ) : (
                    <>
                      <div className={styles.detailTableWrap}>
                        <table className={styles.detailTable}>
                          <thead>
                            <tr>
                              <th className={styles.thCheck}>
                                <input
                                  type="checkbox"
                                  checked={h.allCariSevkSelected}
                                  onChange={h.selectAllCariSevkOrders}
                                  disabled={h.cariSevkOrders.length === 0}
                                  title="Tümünü seç / kaldır"
                                />
                              </th>
                              <th className={styles.thCenter}>Tip</th>
                              <th className={styles.thCenter}>Alt Müşteri</th>
                              <th className={styles.thCenter}>Depo</th>
                              <th className={styles.thCenter}>Sevk Tarihi</th>
                              <th className={styles.thCenter}>Sevk Emri No</th>
                              <th className={styles.thCenter}>Sezon</th>
                              <th className={styles.thCenter}>Kategori</th>
                              <th className={styles.thCenter}>Marka</th>
                              <th className={styles.thCenter}>PSF Tutar</th>
                              <th className={styles.thCenter}>Fatura Tutarı</th>
                              <th className={styles.thCenter}>Onay Durumu</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.cariSevkOrders.length === 0 ? (
                              <tr><td colSpan={12} className={styles.emptyCell}>Sevk emri bulunamadı.</td></tr>
                            ) : (
                              h.cariSevkOrders.map(order => {
                                const isSelected = h.selectedCariSevkIds.has(order.dispOrderHeaderId)
                                return (
                                  <tr
                                    key={order.dispOrderHeaderId}
                                    className={isSelected ? styles.rowSelected : ''}
                                    onClick={() => h.toggleCariSevkSelection(order.dispOrderHeaderId)}
                                  >
                                    <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => h.toggleCariSevkSelection(order.dispOrderHeaderId)}
                                      />
                                    </td>
                                    <td className={`${styles.tdCenter} ${styles.cellBold}`}>{order.type?.trim().toUpperCase() === 'IS' ? 'IS' : order.type?.trim().toUpperCase() === 'RE' ? 'RE' : (order.type?.trim() || '—')}</td>
                                    <td className={styles.tdCenter}>{order.subCurrAccDescription || '—'}</td>
                                    <td className={styles.tdCenter}>{order.warehouseName || '—'}</td>
                                    <td className={styles.tdCenter}>{fmtDate(order.orderDate)}</td>
                                    <td className={`${styles.tdCenter} ${styles.cellBold}`}>{order.dispOrderNo}</td>
                                    <td className={styles.tdCenter}>{order.itAtt02 || '—'}</td>
                                    <td className={styles.tdCenter}>{order.category || '—'}</td>
                                    <td className={styles.tdCenter}>{order.brand || '—'}</td>
                                    <td className={styles.tdCenter}>{fmtMoney(order.baseAmount ?? 0)}</td>
                                    <td className={styles.tdCenter}>{fmtMoney(order.totalAmount ?? 0)}</td>
                                    <td className={styles.tdCenter}><span className={`${styles.badge} ${STATUS_CLASS[order.statusId ?? 0] ?? styles.badgeGray}`}>{order.statusName || '—'}</span></td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {h.selectedCariSevkCount > 0 && (
                        <div className={styles.actionBar}>
                          <span className={styles.actionInfo}>{h.selectedCariSevkCount} sevk emri seçili</span>
                          <div className={styles.cariSevkCircleBtns}>
                            <div className={styles.cariSevkCircleBtnWrap}>
                              <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnSifirla}`} onClick={h.handleCariSevkSifirla} disabled={h.saving} title="Sıfırla" aria-label="Sıfırla">
                                <span className={styles.cariSevkResetIcon} aria-hidden>🔄</span>
                              </button>
                              <span className={styles.cariSevkCircleBtnLabel}>Sıfırla</span>
                            </div>
                            <div className={styles.cariSevkCircleBtnWrap}>
                              <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnBeklet}`} onClick={h.handleCariSevkBeklet} disabled={h.saving} title="Beklet" aria-label="Beklet">
                                ✋
                              </button>
                              <span className={styles.cariSevkCircleBtnLabel}>Beklet</span>
                            </div>
                            <div className={styles.cariSevkCircleBtnWrap}>
                              <button type="button" className={`${styles.cariSevkCircleBtn} ${styles.cariSevkCircleBtnOnayla}`} onClick={h.handleCariSevkOnayla} disabled={h.saving} title="Onayla" aria-label="Onayla">
                                {h.saving ? <span className={styles.spinner} /> : '🚚'}
                              </button>
                              <span className={styles.cariSevkCircleBtnLabel}>Onayla</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {h.cariSevkTotalCount > 0 && (
                        <div className={styles.pagination}>
                          <span className={styles.pageInfo}>
                            Toplam {h.cariSevkTotalCount} sevk emri — Sayfa {h.cariSevkPage} / {h.cariSevkTotalPages}
                          </span>
                          <div className={styles.pageButtons}>
                            <button type="button" className={styles.pageBtn} onClick={() => h.setCariSevkPage(1)} disabled={h.cariSevkPage <= 1}>İlk</button>
                            <button type="button" className={styles.pageBtn} onClick={() => h.setCariSevkPage(h.cariSevkPage - 1)} disabled={h.cariSevkPage <= 1}>Önceki</button>
                            <button type="button" className={styles.pageBtn} onClick={() => h.setCariSevkPage(h.cariSevkPage + 1)} disabled={h.cariSevkPage >= h.cariSevkTotalPages}>Sonraki</button>
                            <button type="button" className={styles.pageBtn} onClick={() => h.setCariSevkPage(h.cariSevkTotalPages ?? 1)} disabled={h.cariSevkPage >= h.cariSevkTotalPages}>Son</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
