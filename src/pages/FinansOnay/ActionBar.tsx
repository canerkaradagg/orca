import type { StatusOption, WaitReasonOption } from './useFinansOnay'
import styles from './FinansOnay.module.css'

const STATUS_COLOR: Record<number, string> = {
  0: styles.statusGray,
  1: styles.statusOrange,
  2: styles.statusGreen,
}

interface Props {
  selectedCount: number
  actionStatuses: StatusOption[]
  waitReasons: WaitReasonOption[]
  activeAction: number | null
  waitReasonInput: string
  onWaitReasonChange: (v: string) => void
  onAction: (statusId: number) => void
  onConfirmWait: () => void
  onCancel: () => void
  saving: boolean
}

export function ActionBar({
  selectedCount, actionStatuses, waitReasons,
  activeAction, waitReasonInput, onWaitReasonChange,
  onAction, onConfirmWait, onCancel, saving,
}: Props) {
  if (selectedCount === 0) return null

  return (
    <div className={styles.actionBar}>
      <span className={styles.actionInfo}>{selectedCount} satır seçili</span>

      <div className={styles.actionButtons}>
        {actionStatuses.map(s => (
          <button
            key={s.id}
            className={`${styles.actionBtn} ${STATUS_COLOR[s.id] ?? ''}`}
            onClick={() => onAction(s.id)}
            disabled={saving}
          >
            {s.name}
          </button>
        ))}
      </div>

      {activeAction === 1 && (
        <div className={styles.waitReasonBox}>
          <select
            className={styles.waitReasonSelect}
            value={waitReasonInput}
            onChange={e => onWaitReasonChange(e.target.value)}
          >
            <option value="">Bekleme nedeni seçin...</option>
            {waitReasons.map(r => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
          <button
            className={styles.confirmBtn}
            onClick={onConfirmWait}
            disabled={saving || !waitReasonInput}
          >
            {saving ? <span className={styles.spinner} /> : 'Onayla'}
          </button>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={saving}>
            İptal
          </button>
        </div>
      )}
    </div>
  )
}
