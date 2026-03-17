import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../lib/api-client'
import styles from './Roller.module.css'

interface Role {
  RoleId: number
  RoleName: string
  Description: string | null
  IsActive: boolean
  UserCount: number
}

interface ScreenPermission {
  ScreenId: number
  ScreenCode: string
  ScreenName: string
  ParentCode: string | null
  CanView: boolean
  CanEdit: boolean
  CanDelete: boolean
}

type ModalMode = 'create' | 'edit' | 'permissions' | null

export function Roller() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [permissions, setPermissions] = useState<ScreenPermission[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const loadRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ ok: boolean; roles: Role[] }>('/api/admin/roles')
      if (res.ok) setRoles(res.roles || [])
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Roller yüklenemedi.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  const openCreate = () => {
    setFormName('')
    setFormDesc('')
    setSelectedRole(null)
    setModalMode('create')
    setMessage(null)
  }

  const openEdit = (role: Role) => {
    setFormName(role.RoleName)
    setFormDesc(role.Description || '')
    setSelectedRole(role)
    setModalMode('edit')
    setMessage(null)
  }

  const openPermissions = async (role: Role) => {
    setSelectedRole(role)
    setModalMode('permissions')
    setMessage(null)
    try {
      const res = await api.get<{ ok: boolean; permissions: ScreenPermission[] }>(
        `/api/admin/roles/${role.RoleId}/permissions`,
      )
      if (res.ok) setPermissions(res.permissions || [])
    } catch {
      setMessage({ type: 'error', text: 'Yetkiler yüklenemedi.' })
    }
  }

  const saveRole = async () => {
    setSaving(true)
    try {
      if (modalMode === 'create') {
        await api.post('/api/admin/roles', { roleName: formName, description: formDesc })
        setMessage({ type: 'ok', text: 'Rol oluşturuldu.' })
      } else if (modalMode === 'edit' && selectedRole) {
        await api.put(`/api/admin/roles/${selectedRole.RoleId}`, {
          roleName: formName,
          description: formDesc,
        })
        setMessage({ type: 'ok', text: 'Rol güncellendi.' })
      }
      setModalMode(null)
      await loadRoles()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Kayıt hatası.' })
    } finally {
      setSaving(false)
    }
  }

  const savePermissions = async () => {
    if (!selectedRole) return
    setSaving(true)
    try {
      await api.put(`/api/admin/roles/${selectedRole.RoleId}/permissions`, {
        permissions: permissions.map(p => ({
          screenId: p.ScreenId,
          canView: p.CanView,
          canEdit: p.CanEdit,
          canDelete: p.CanDelete,
        })),
      })
      setMessage({ type: 'ok', text: 'Yetkiler kaydedildi.' })
      setModalMode(null)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Yetki kayıt hatası.' })
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (role: Role) => {
    if (!confirm(`"${role.RoleName}" rolünü silmek istediğinize emin misiniz?`)) return
    try {
      await api.delete(`/api/admin/roles/${role.RoleId}`)
      setMessage({ type: 'ok', text: 'Rol silindi.' })
      await loadRoles()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Silme hatası.' })
    }
  }

  const togglePerm = (screenId: number, field: 'CanView' | 'CanEdit' | 'CanDelete') => {
    setPermissions(prev =>
      prev.map(p => (p.ScreenId === screenId ? { ...p, [field]: !p[field] } : p)),
    )
  }

  const groupedPermissions = permissions.reduce<Record<string, ScreenPermission[]>>((acc, p) => {
    const group = p.ParentCode || 'diger'
    if (!acc[group]) acc[group] = []
    acc[group].push(p)
    return acc
  }, {})

  const groupLabels: Record<string, string> = {
    'asn-islemleri': 'ASN İşlemleri',
    finans: 'Finans',
    raporlar: 'Raporlar',
    ayarlar: 'Ayarlar',
    yonetim: 'Yönetim',
    diger: 'Diğer',
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Roller</h1>
          <p className={styles.subtitle}>Kullanıcı rollerini ve ekran yetkilerini yönetin</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>
          Yeni Rol
        </button>
      </div>

      {message && (
        <div className={message.type === 'ok' ? styles.messageOk : styles.messageError}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className={styles.subtitle}>Yükleniyor…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rol Adı</th>
                <th>Açıklama</th>
                <th>Kullanıcı</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.RoleId}>
                  <td className={styles.cellBold}>{role.RoleName}</td>
                  <td>{role.Description || '—'}</td>
                  <td>{role.UserCount}</td>
                  <td>
                    <span className={role.IsActive ? styles.badgeActive : styles.badgeInactive}>
                      {role.IsActive ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      onClick={() => openPermissions(role)}
                    >
                      Yetkiler
                    </button>
                    <button
                      type="button"
                      className={styles.btnSmall}
                      onClick={() => openEdit(role)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className={styles.btnSmallDanger}
                      onClick={() => deleteRole(role)}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>
                    Henüz rol yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className={styles.overlay} onClick={() => setModalMode(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>{modalMode === 'create' ? 'Yeni Rol' : 'Rol Düzenle'}</h2>
            <label className={styles.formLabel}>
              <span>Rol Adı</span>
              <input
                className={styles.formInput}
                value={formName}
                onChange={e => setFormName(e.target.value)}
                autoFocus
              />
            </label>
            <label className={styles.formLabel}>
              <span>Açıklama</span>
              <input
                className={styles.formInput}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setModalMode(null)}
              >
                İptal
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={saveRole}
                disabled={saving || !formName.trim()}
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'permissions' && selectedRole && (
        <div className={styles.overlay} onClick={() => setModalMode(null)}>
          <div className={styles.modalWide} onClick={e => e.stopPropagation()}>
            <h2>{selectedRole.RoleName} – Ekran Yetkileri</h2>
            <div className={styles.permGrid}>
              {Object.entries(groupedPermissions).map(([group, items]) => (
                <div key={group} className={styles.permGroup}>
                  <h3 className={styles.permGroupTitle}>{groupLabels[group] || group}</h3>
                  {items.map(p => (
                    <div key={p.ScreenId} className={styles.permRow}>
                      <span className={styles.permScreen}>{p.ScreenName}</span>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={p.CanView}
                          onChange={() => togglePerm(p.ScreenId, 'CanView')}
                        />
                        <span>Görüntüle</span>
                      </label>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={p.CanEdit}
                          onChange={() => togglePerm(p.ScreenId, 'CanEdit')}
                        />
                        <span>Düzenle</span>
                      </label>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={p.CanDelete}
                          onChange={() => togglePerm(p.ScreenId, 'CanDelete')}
                        />
                        <span>Sil</span>
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setModalMode(null)}
              >
                İptal
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={savePermissions}
                disabled={saving}
              >
                {saving ? 'Kaydediliyor…' : 'Yetkileri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
