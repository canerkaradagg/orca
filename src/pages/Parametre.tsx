import { useState, useEffect, useCallback } from 'react'
import styles from './Parametre.module.css'
import { api } from '../lib/api-client'

export interface SystemParameterRow {
  parameterKey: string
  parameterValue: string
  description: string
  updatedAt: string | null
  updatedBy: string | null
}

export interface ExceptionStoreItem {
  currAccTypeCode: number
  currAccCode: string
}

/** Parametre grupları – akordiyon başlıkları ve hangi key'lerin o grupta olduğu */
const PARAM_GROUPS: { id: string; title: string; description: string; keys: string[] }[] = [
  {
    id: 'orcaTrigger',
    title: 'OrcaTrigger (Tetikleyici servisi)',
    description: 'Windows tetikleyici servisinin job çalışma aralıkları (dakika). 0 = ilgili job kapalı.',
    keys: [
      'QueueProcessIntervalMinutes',
      'DraftCleanupIntervalMinutes',
      'LogCleanupIntervalMinutes',
      'MaintenanceRunIntervalMinutes',
      'UpdateReplenishmentIntervalMinutes',
      'SyncDispOrderFromErpIntervalMinutes',
      'UpdateDispOrderHeaderCategorySeasonIntervalMinutes',
      'UpdateDispOrderHeaderCategorySeasonMaxRows',
    ],
  },
  {
    id: 'orcaApi',
    title: 'Kuyruk (ERP post)',
    description: 'Kuyruktan kaç kayıt çekileceği, ERP\'ye kaçarlı gruplar hâlinde post edileceği ve maksimum deneme sayısı.',
    keys: ['QueueBatchSize', 'QueuePostChunkSize', 'MaxTryCount'],
  },
  {
    id: 'bakim',
    title: 'Bakım (rapor ve sağlık eşikleri)',
    description: 'Bakım raporu e-postası ve eşik tabanlı kontrol (tablo satır uyarı, fragmantasyon, istatistik).',
    keys: [
      'MaintenanceReportEmail',
      'MaintenanceTableRowWarning',
      'MaintenanceFragmentationPercent',
      'MaintenanceStatisticsStaleDays',
      'MaintenanceRunFixWhenNeeded',
    ],
  },
  {
    id: 'log',
    title: 'Log',
    description: 'Log saklama ve temizlik süreleri.',
    keys: ['LogRetentionDays'],
  },
]

const PARAM_LABELS: Record<string, string> = {
  QueueProcessIntervalMinutes: 'Kuyruk işleme (dakika)',
  DraftCleanupIntervalMinutes: 'Draft temizlik (dakika)',
  LogCleanupIntervalMinutes: 'Log temizlik (dakika)',
  MaintenanceRunIntervalMinutes: 'Bakım raporu (dakika)',
  UpdateReplenishmentIntervalMinutes: 'Update Replenishment (dakika)',
  SyncDispOrderFromErpIntervalMinutes: 'Sync DispOrder (dakika)',
  UpdateDispOrderHeaderCategorySeasonIntervalMinutes: 'DispOrderHeader Category/Season (dakika)',
  UpdateDispOrderHeaderCategorySeasonMaxRows: 'Category/Season max satır (boş = sınırsız)',
  QueueBatchSize: 'Kuyruktan çekilecek kayıt sayısı (batch)',
  QueuePostChunkSize: "ERP'ye aynı anda post edilecek kayıt sayısı (chunk, 0=ardışık)",
  MaxTryCount: 'Maksimum deneme sayısı (IsMaxTry eşiği)',
  MaintenanceReportEmail: 'Bakım raporu e-posta',
  MaintenanceTableRowWarning: 'Tablo satır uyarı eşiği',
  MaintenanceFragmentationPercent: 'Fragmantasyon eşiği (%)',
  MaintenanceStatisticsStaleDays: 'İstatistik eski sayılacak gün',
  MaintenanceRunFixWhenNeeded: 'Eşik aşımında bakım uygula (1=evet, 0=hayır)',
  LogRetentionDays: 'Log saklama süresi (gün)',
}

const ALL_GROUP_KEYS = new Set(PARAM_GROUPS.flatMap(g => g.keys))

const DEFAULT_VALUES: Record<string, string> = {
  QueueProcessIntervalMinutes: '1',
  DraftCleanupIntervalMinutes: '1440',
  LogCleanupIntervalMinutes: '1440',
  MaintenanceRunIntervalMinutes: '1440',
  UpdateReplenishmentIntervalMinutes: '60',
  SyncDispOrderFromErpIntervalMinutes: '0',
  UpdateDispOrderHeaderCategorySeasonIntervalMinutes: '0',
  UpdateDispOrderHeaderCategorySeasonMaxRows: '',
  QueueBatchSize: '100',
  QueuePostChunkSize: '20',
  MaxTryCount: '10',
  LogRetentionDays: '30',
  MaintenanceReportEmail: 'caner.karadag@olka.com.tr',
  MaintenanceTableRowWarning: '500000',
  MaintenanceFragmentationPercent: '15',
  MaintenanceStatisticsStaleDays: '7',
  MaintenanceRunFixWhenNeeded: '1',
}

export function Parametre() {
  const [parameters, setParameters] = useState<SystemParameterRow[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [exceptionList, setExceptionList] = useState<ExceptionStoreItem[]>([])
  const [exceptionListLoading, setExceptionListLoading] = useState(false)
  const [exceptionListSaving, setExceptionListSaving] = useState(false)
  const [exceptionListMessage, setExceptionListMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [newTypeCode, setNewTypeCode] = useState<string>('3')
  const [newAccCode, setNewAccCode] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await api.get<{ ok: boolean; parameters?: SystemParameterRow[]; error?: string }>('/api/parameters')
      if (res?.ok && Array.isArray(res.parameters)) {
        setParameters(res.parameters)
        setEdits({})
      } else {
        setMessage({ type: 'error', text: (res as { error?: string })?.error || 'Parametreler yüklenemedi.' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessage({ type: 'error', text: (err instanceof Error ? err.message : String(err)) || 'Bağlantı hatası.' })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadExceptionStoreList = useCallback(async () => {
    setExceptionListLoading(true)
    setExceptionListMessage(null)
    try {
      const res = await api.get<{ ok: boolean; items?: ExceptionStoreItem[]; error?: string }>('/api/exception-store-list')
      if (res?.ok && Array.isArray(res.items)) {
        setExceptionList(res.items)
      } else {
        setExceptionListMessage({ type: 'error', text: res?.error || 'Exception Store List yüklenemedi.' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setExceptionListMessage({
        type: 'error',
        text: (err instanceof Error ? err.message : String(err)) || 'Exception Store List yüklenemedi. Veritabanında ExceptionStore tablosu oluşturulmuş olmalıdır.',
      })
    } finally {
      setExceptionListLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadExceptionStoreList()
  }, [loadExceptionStoreList])

  const setEdit = (key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }))
  }

  const getDisplayValue = (row: SystemParameterRow) => {
    if (edits[row.parameterKey] !== undefined) return edits[row.parameterKey]
    return row.parameterValue ?? ''
  }

  const getParamValue = (key: string) => {
    if (edits[key] !== undefined) return edits[key]
    const row = parameters.find(p => p.parameterKey === key)
    return row ? (row.parameterValue ?? DEFAULT_VALUES[key] ?? '') : (DEFAULT_VALUES[key] ?? '')
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const keysInList = new Set(parameters.map(x => x.parameterKey))
      const list = parameters.map(row => ({
        parameterKey: row.parameterKey,
        parameterValue: edits[row.parameterKey] !== undefined ? edits[row.parameterKey] : row.parameterValue,
      }))
      for (const key of [...ALL_GROUP_KEYS, ...Object.keys(DEFAULT_VALUES)]) {
        if (!keysInList.has(key)) {
          list.push({ parameterKey: key, parameterValue: getParamValue(key) })
          keysInList.add(key)
        }
      }
      const res = await api.put<{ ok: boolean; error?: string }>('/api/parameters', { parameters: list })
      if ((res as { ok?: boolean })?.ok) {
        setMessage({ type: 'ok', text: 'Parametreler kaydedildi.' })
        setEdits({})
        await load()
      } else {
        setMessage({ type: 'error', text: (res as { error?: string })?.error || 'Kayıt başarısız.' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessage({ type: 'error', text: (err instanceof Error ? err.message : String(err)) || 'Kayıt hatası.' })
    } finally {
      setSaving(false)
    }
  }

  const hasEdits = Object.keys(edits).length > 0

  const [openAccordion, setOpenAccordion] = useState<Record<string, boolean>>(() => ({
    orcaTrigger: true,
    orcaApi: false,
    bakim: false,
    log: false,
    diger: false,
    exceptionStore: false,
  }))
  const toggleAccordion = (id: string) => {
    setOpenAccordion(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const otherParams = parameters.filter(p => !ALL_GROUP_KEYS.has(p.parameterKey))

  const addExceptionStoreItem = () => {
    const typeCode = parseInt(newTypeCode, 10)
    const code = newAccCode.trim()
    if (Number.isNaN(typeCode) || code === '') return
    setExceptionList(prev => [...prev, { currAccTypeCode: typeCode, currAccCode: code }])
    setNewAccCode('')
  }

  const removeExceptionStoreItem = (index: number) => {
    setExceptionList(prev => prev.filter((_, i) => i !== index))
  }

  const saveExceptionStoreList = async () => {
    setExceptionListSaving(true)
    setExceptionListMessage(null)
    try {
      const res = await api.put<{ ok: boolean; error?: string }>('/api/exception-store-list', { items: exceptionList })
      if ((res as { ok?: boolean })?.ok) {
        setExceptionListMessage({ type: 'ok', text: 'Exception Store List kaydedildi.' })
        await loadExceptionStoreList()
      } else {
        setExceptionListMessage({ type: 'error', text: (res as { error?: string })?.error || 'Kayıt başarısız.' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setExceptionListMessage({ type: 'error', text: (err instanceof Error ? err.message : String(err)) || 'Kayıt hatası.' })
    } finally {
      setExceptionListSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1>Sistem Parametreleri</h1>
          <p className={styles.subtitle}>Yükleniyor…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Sistem Parametreleri</h1>
        <p className={styles.subtitle}>
          Kuyruk işleme sıklığı, log temizlik süresi, IsMaxTry eşiği ve benzeri ayarlar. Windows Service ve API bu değerleri kullanır.
        </p>
      </div>

      {message && (
        <div className={message.type === 'ok' ? styles.messageOk : styles.messageError}>
          {message.text}
        </div>
      )}

<section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>Parametreler</h2>
          <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving || !hasEdits}>
            {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
          </button>
        </div>

        <div className={styles.accordion}>
          {PARAM_GROUPS.map(group => {
            const isOpen = openAccordion[group.id] ?? false
            const rows = group.keys.map(key => {
              const row = parameters.find(p => p.parameterKey === key)
              return { key, row: row ?? { parameterKey: key, parameterValue: DEFAULT_VALUES[key] ?? '', description: '' } }
            })
            return (
              <div key={group.id} className={styles.accordionItem} data-open={isOpen}>
                <button type="button" className={styles.accordionHeader} onClick={() => toggleAccordion(group.id)} aria-expanded={isOpen}>
                  <span>{group.title}</span>
                  <svg className={styles.accordionChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className={styles.accordionBody} style={{ height: isOpen ? 'auto' : 0 }}>
                  <div className={styles.accordionContent}>
                    <p className={styles.accordionDescription}>{group.description}</p>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Parametre</th>
                            <th style={{ width: '180px' }}>Değer</th>
                            <th>Açıklama</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ key, row }) => (
                            <tr key={key}>
                              <td className={styles.cellKey}>{PARAM_LABELS[key] ?? key}</td>
                              <td>
                                <input
                                  type={key.includes('Email') ? 'email' : key.includes('Percent') || key.includes('Days') || key.includes('Minutes') || key.includes('Count') || key.includes('Warning') || key.includes('Size') ? 'number' : 'text'}
                                  className={styles.input}
                                  min={key.includes('RunFix') ? 0 : undefined}
                                  value={getParamValue(key)}
                                  onChange={e => setEdit(key, e.target.value)}
                                  aria-label={PARAM_LABELS[key] ?? key}
                                />
                              </td>
                              <td className={styles.cellDesc}>{row.description || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {otherParams.length > 0 && (
            <div className={styles.accordionItem} data-open={openAccordion.diger ?? false}>
              <button type="button" className={styles.accordionHeader} onClick={() => toggleAccordion('diger')} aria-expanded={openAccordion.diger ?? false}>
                <span>Diğer parametreler</span>
                <svg className={styles.accordionChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className={styles.accordionBody} style={{ height: (openAccordion.diger ?? false) ? 'auto' : 0 }}>
                <div className={styles.accordionContent}>
                  <p className={styles.accordionDescription}>Grup dışı parametreler.</p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Parametre</th>
                          <th style={{ width: '180px' }}>Değer</th>
                          <th>Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherParams.map(row => (
                          <tr key={row.parameterKey}>
                            <td className={styles.cellKey}>{row.parameterKey}</td>
                            <td>
                              <input
                                type="text"
                                className={styles.input}
                                value={getDisplayValue(row)}
                                onChange={e => setEdit(row.parameterKey, e.target.value)}
                                aria-label={row.parameterKey}
                              />
                            </td>
                            <td className={styles.cellDesc}>{row.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={styles.accordionItem} data-open={openAccordion.exceptionStore ?? false}>
            <button type="button" className={styles.accordionHeader} onClick={() => toggleAccordion('exceptionStore')} aria-expanded={openAccordion.exceptionStore ?? false}>
              <span>Exception Store List</span>
              <svg className={styles.accordionChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className={styles.accordionBody} style={{ height: (openAccordion.exceptionStore ?? false) ? 'auto' : 0 }}>
              <div className={styles.accordionContent}>
                <p className={styles.accordionDescription}>
                  Alokasyonda &quot;Exception&quot; olarak işlenecek cari/magaza listesi (Union mantığı). Cari tip kodu (örn. 3=Müşteri, 5=Mağaza) ve cari kodu ile ekleyin.
                </p>
                {exceptionListMessage && (
                  <div className={exceptionListMessage.type === 'ok' ? styles.messageOk : styles.messageError}>
                    {exceptionListMessage.text}
                  </div>
                )}
                <div className={styles.sectionHeaderRow}>
                  <div className={styles.addRow}>
                    <input
                      type="number"
                      className={styles.input}
                      value={newTypeCode}
                      onChange={e => setNewTypeCode(e.target.value)}
                      placeholder="Tip (3,5)"
                      min={1}
                      max={255}
                      style={{ width: '80px' }}
                      aria-label="Cari tip kodu"
                    />
                    <input
                      type="text"
                      className={styles.input}
                      value={newAccCode}
                      onChange={e => setNewAccCode(e.target.value)}
                      placeholder="Cari kodu"
                      style={{ width: '140px' }}
                      aria-label="Cari kodu"
                    />
                    <button type="button" className={styles.btnPrimary} onClick={addExceptionStoreItem}>
                      Ekle
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={saveExceptionStoreList}
                    disabled={exceptionListSaving || exceptionListLoading}
                  >
                    {exceptionListSaving ? 'Kaydediliyor…' : 'Listeyi Kaydet'}
                  </button>
                </div>
                {exceptionListLoading ? (
                  <p className={styles.subtitle}>Yükleniyor…</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Cari Tip Kodu</th>
                          <th>Cari Kodu</th>
                          <th style={{ width: '80px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {exceptionList.length === 0 ? (
                          <tr>
                            <td colSpan={3} className={styles.cellDesc}>
                              Liste boş. Yukarıdan cari ekleyip &quot;Listeyi Kaydet&quot; ile kaydedin.
                            </td>
                          </tr>
                        ) : (
                          exceptionList.map((item, index) => (
                            <tr key={`${item.currAccTypeCode}-${item.currAccCode}-${index}`}>
                              <td>{item.currAccTypeCode}</td>
                              <td>{item.currAccCode}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  onClick={() => removeExceptionStoreItem(index)}
                                  aria-label="Kaldır"
                                >
                                  Kaldır
                                </button>
                              </td>
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
        </div>
      </section>

    </div>
  )
}
