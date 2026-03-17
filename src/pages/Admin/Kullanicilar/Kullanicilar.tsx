import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../lib/api-client'
import styles from './Kullanicilar.module.css'

interface User {
  UserId: number
  Email: string
  DisplayName: string
  IsExternal: boolean
  IsActive: boolean
  CreatedAt: string
  LastLoginAt: string | null
  RoleNames: string | null
}

interface RoleAssignment {
  RoleId: number
  RoleName: string
  Description: string | null
  IsAssigned: boolean
}

type ModalMode = 'create' | 'edit' | 'roles' | null

export function Kullanicilar() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formExternal, setFormExternal] = useState(false)
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ ok: boolean; users: User[] }>('/api/admin/users')
      if (res.ok) setUsers(res.users || [])
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Kullanıcılar yüklenemedi.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const openCreate = () => {
    setFormEmail('')
    setFormName('')
    setFormPassword('')
    setFormExternal(false)
    setSelectedUser(null)
    setModalMode('create')
    setMessage(null)
  }

  const openEdit = (user: User) => {
    setFormEmail(user.Email)
    setFormName(user.DisplayName)
    setFormPassword('')
    setFormExternal(user.IsExternal)
    setSelectedUser(user)
    setModalMode('edit')
    setMessage(null)
  }

  const openRoles = async (user: User) => {
    setSelectedUser(user)
    setModalMode('roles')
    setMessage(null)
    try {
      const res = await api.get<{ ok: boolean; roles: RoleAssignment[] }>(`/api/admin/users/${user.UserId}/roles`)
      if (res.ok) setRoleAssignments(res.roles || [])
    } catch {
      setMessage({ type: 'error', text: 'Roller yüklenemedi.' })
    }
  }

  const saveUser = async () => {
    setSaving(true)
    try {
      if (modalMode === 'create') {
        const body: Record<string, unknown> = { email: formEmail, displayName: formName, isExternal: formExternal }
        if (formPassword) body.password = formPassword
        await api.post('/api/admin/users', body)
        setMessage({ type: 'ok', text: 'Kullanıcı oluşturuldu.' })
      } else if (modalMode === 'edit' && selectedUser) {
        const body: Record<string, unknown> = { email: formEmail, displayName: formName, isExternal: formExternal }
        if (formPassword) body.password = formPassword
        await api.put(`/api/admin/users/${selectedUser.UserId}`, body)
        setMessage({ type: 'ok', text: 'Kullanıcı güncellendi.' })
      }
      setModalMode(null)
      await loadUsers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Kayıt hatası.' })
    } finally {
      setSaving(false)
    }
  }

  const saveRoles = async () => {
    if (!selectedUser) return
    setSaving(true)
    try {
      const roleIds = roleAssignments.filter(r => r.IsAssigned).map(r => r.RoleId)
      await api.put(`/api/admin/users/${selectedUser.UserId}/roles`, { roleIds })
      setMessage({ type: 'ok', text: 'Roller kaydedildi.' })
      setModalMode(null)
      await loadUsers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rol kayıt hatası.' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user: User) => {
    try {
      await api.put(`/api/admin/users/${user.UserId}`, { isActive: !user.IsActive })
      await loadUsers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Güncelleme hatası.' })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Kullanıcılar</h1>
          <p className={styles.subtitle}>Kullanıcı hesaplarını ve rol atamalarını yönetin</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>Yeni Kullanıcı</button>
      </div>

      {message && (
        <div className={message.type === 'ok' ? styles.messageOk : styles.messageError}>{message.text}</div>
      )}

      {loading ? (
        <p className={styles.subtitle}>Yükleniyor…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>E-posta</th>
                <th>Roller</th>
                <th>Tip</th>
                <th>Durum</th>
                <th>Son Giriş</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.UserId}>
                  <td className={styles.cellBold}>{user.DisplayName}</td>
                  <td>{user.Email}</td>
                  <td><span className={styles.roleChips}>{user.RoleNames || '—'}</span></td>
                  <td>
                    <span className={user.IsExternal ? styles.badgeExternal : styles.badgeInternal}>
                      {user.IsExternal ? 'Dış' : 'İç'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className={user.IsActive ? styles.badgeActive : styles.badgeInactive} onClick={() => toggleActive(user)}>
                      {user.IsActive ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className={styles.cellSmall}>{user.LastLoginAt ? new Date(user.LastLoginAt).toLocaleString('tr-TR') : '—'}</td>
                  <td className={styles.actions}>
                    <button type="button" className={styles.btnSmall} onClick={() => openRoles(user)}>Roller</button>
                    <button type="button" className={styles.btnSmall} onClick={() => openEdit(user)}>Düzenle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className={styles.overlay} onClick={() => setModalMode(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>{modalMode === 'create' ? 'Yeni Kullanıcı' : 'Kullanıcı Düzenle'}</h2>
            <label className={styles.formLabel}>
              <span>E-posta</span>
              <input type="email" className={styles.formInput} value={formEmail} onChange={e => setFormEmail(e.target.value)} autoFocus />
            </label>
            <label className={styles.formLabel}>
              <span>Ad Soyad</span>
              <input className={styles.formInput} value={formName} onChange={e => setFormName(e.target.value)} />
            </label>
            <label className={styles.formLabel}>
              <span>{modalMode === 'create' ? 'Şifre' : 'Yeni Şifre (boş bırakılabilir)'}</span>
              <input type="password" className={styles.formInput} value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder={modalMode === 'edit' ? 'Değiştirmek istemiyorsanız boş bırakın' : ''} />
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={formExternal} onChange={e => setFormExternal(e.target.checked)} />
              <span>Dış kullanıcı (müşteri)</span>
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalMode(null)}>İptal</button>
              <button type="button" className={styles.btnPrimary} onClick={saveUser} disabled={saving || !formEmail.trim() || !formName.trim()}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'roles' && selectedUser && (
        <div className={styles.overlay} onClick={() => setModalMode(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>{selectedUser.DisplayName} – Rol Atama</h2>
            <div className={styles.roleList}>
              {roleAssignments.map(role => (
                <label key={role.RoleId} className={styles.roleItem}>
                  <input
                    type="checkbox"
                    checked={role.IsAssigned}
                    onChange={() => setRoleAssignments(prev => prev.map(r =>
                      r.RoleId === role.RoleId ? { ...r, IsAssigned: !r.IsAssigned } : r
                    ))}
                  />
                  <div>
                    <span className={styles.roleName}>{role.RoleName}</span>
                    {role.Description && <span className={styles.roleDesc}>{role.Description}</span>}
                  </div>
                </label>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalMode(null)}>İptal</button>
              <button type="button" className={styles.btnPrimary} onClick={saveRoles} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Rolleri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
