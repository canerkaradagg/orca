import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './contexts/AuthContext'
import { IconAsnIslemleri, IconUpload, IconList, IconSettings } from './components/MenuIcons'
import styles from './App.module.css'

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const AsnDosyasiYukle = lazy(() => import('./pages/AsnDosyasiYukle').then(m => ({ default: m.AsnDosyasiYukle })))
const AsnListele = lazy(() => import('./pages/AsnListele').then(m => ({ default: m.AsnListele })))
const Parametre = lazy(() => import('./pages/Parametre').then(m => ({ default: m.Parametre })))
const Roller = lazy(() => import('./pages/Admin/Roller').then(m => ({ default: m.Roller })))
const Kullanicilar = lazy(() => import('./pages/Admin/Kullanicilar').then(m => ({ default: m.Kullanicilar })))
const FinansOnay = lazy(() => import('./pages/FinansOnay').then(m => ({ default: m.FinansOnay })))
const CekiListesiOlustur = lazy(() => import('./pages/CekiListesiOlustur').then(m => ({ default: m.CekiListesiOlustur })))
const CekiListesi = lazy(() => import('./pages/CekiListesi').then(m => ({ default: m.CekiListesi })))
const SevkEmriRaporu = lazy(() => import('./pages/SevkEmriRaporu').then(m => ({ default: m.SevkEmriRaporu })))

const MENU_GROUPS = [
  {
    key: 'asn-islemleri',
    label: 'ASN İşlemleri',
    icon: <IconAsnIslemleri />,
    items: [
      { path: '/asn-islemleri/dosya-yukle', label: 'Dosya Yükle', screen: 'asn-dosya-yukle', icon: <IconUpload /> },
      { path: '/asn-islemleri/asn-listele', label: 'ASN Listele', screen: 'asn-listele', icon: <IconList /> },
    ],
  },
  {
    key: 'finans',
    label: 'Finans',
    icon: <IconSettings />,
    items: [
      { path: '/finans/finans-onay', label: 'Finans Onay', screen: 'finans-onay', icon: <IconList /> },
    ],
  },
  {
    key: 'sevkiyat',
    label: 'Sevkiyat',
    icon: <IconList />,
    items: [
      { path: '/sevkiyat/ceki-listesi-olustur', label: 'Çeki Listesi Oluştur', screen: 'ceki-listesi-olustur', icon: <IconUpload /> },
      { path: '/sevkiyat/ceki-listesi', label: 'Çeki Listesi', screen: 'ceki-listesi', icon: <IconList /> },
    ],
  },
  {
    key: 'raporlar',
    label: 'Raporlar',
    icon: <IconList />,
    items: [
      { path: '/raporlar/sevk-emri-raporu', label: 'Sevk Emri Raporu', screen: 'sevk-emri-raporu', icon: <IconList /> },
    ],
  },
  {
    key: 'ayarlar',
    label: 'Ayarlar',
    icon: <IconSettings />,
    items: [
      { path: '/ayarlar/parametreler', label: 'Parametreler', screen: 'parametreler', icon: <IconSettings /> },
    ],
  },
  {
    key: 'yonetim',
    label: 'Yönetim',
    icon: <IconSettings />,
    adminOnly: true,
    items: [
      { path: '/yonetim/roller', label: 'Roller', screen: 'admin-roller', icon: <IconSettings /> },
      { path: '/yonetim/kullanicilar', label: 'Kullanıcılar', screen: 'admin-kullanicilar', icon: <IconSettings /> },
    ],
  },
] as const

function AppShell() {
  const location = useLocation()
  const { user, logout, hasPermission, isAdmin } = useAuth()
  const [openAccordion, setOpenAccordion] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    for (const group of MENU_GROUPS) {
      if (group.items.some(i => location.pathname.startsWith(i.path))) {
        setOpenAccordion(group.key)
        break
      }
    }
  }, [location.pathname])

  const toggleAccordion = (key: string) =>
    setOpenAccordion(prev => (prev === key ? null : key))

  const visibleGroups = MENU_GROUPS.filter(g => {
    if ('adminOnly' in g && g.adminOnly && !isAdmin) return false
    return g.items.some(i => hasPermission(i.screen))
  })

  return (
    <div className={styles.layout}>
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? '' : styles.sidebarCollapsed}`}
        aria-hidden={!sidebarOpen}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.logoWrap}>
            <img src="/logo/OlkaGroup.png" alt="Olka Group" className={styles.logo} />
          </div>
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setSidebarOpen(false)}
            title="Menüyü gizle"
            aria-label="Menüyü gizle"
          >
            ‹
          </button>
        </div>

        <nav className={styles.nav}>
          {visibleGroups.map(group => {
            const isGroupActive = group.items.some(i => location.pathname.startsWith(i.path))
            const visibleItems = group.items.filter(i => hasPermission(i.screen))
            if (visibleItems.length === 0) return null
            return (
              <div className={styles.navGroup} key={group.key}>
                <button
                  type="button"
                  className={[
                    styles.accordionTrigger,
                    openAccordion === group.key ? styles.accordionOpen : '',
                    isGroupActive ? styles.accordionHasActive : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleAccordion(group.key)}
                  aria-expanded={openAccordion === group.key}
                >
                  <span className={styles.navItemContent}>
                    <span className={styles.navIcon}>{group.icon}</span>
                    <span>{group.label}</span>
                  </span>
                  <span className={styles.accordionChevron} aria-hidden>›</span>
                </button>
                <div className={`${styles.navSub} ${openAccordion === group.key ? styles.navSubOpen : ''}`}>
                  {visibleItems.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        [styles.navSubLink, isActive ? styles.navSubLinkActive : ''].filter(Boolean).join(' ')
                      }
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {user && (
          <div className={styles.sidebarFooter}>
            <div className={styles.userInfo}>
              <span className={styles.userAvatar}>{user.displayName.charAt(0).toUpperCase()}</span>
              <div className={styles.userDetail}>
                <span className={styles.userName}>{user.displayName}</span>
                <span className={styles.userEmail}>{user.email}</span>
              </div>
            </div>
            <button type="button" className={styles.logoutBtn} onClick={logout} title="Çıkış Yap">
              ⏻
            </button>
          </div>
        )}
      </aside>

      {!sidebarOpen && (
        <button
          type="button"
          className={styles.sidebarReopen}
          onClick={() => setSidebarOpen(true)}
          title="Menüyü aç"
          aria-label="Menüyü aç"
        >
          ›
        </button>
      )}

      <main className={styles.main}>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor…</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/asn-islemleri/dosya-yukle" replace />} />
              <Route path="/asn-islemleri/dosya-yukle" element={<ProtectedRoute screen="asn-dosya-yukle"><AsnDosyasiYukle /></ProtectedRoute>} />
              <Route path="/asn-islemleri/asn-listele" element={<ProtectedRoute screen="asn-listele"><AsnListele /></ProtectedRoute>} />
              <Route path="/ayarlar/parametreler" element={<ProtectedRoute screen="parametreler"><Parametre /></ProtectedRoute>} />
              <Route path="/finans/finans-onay" element={<ProtectedRoute screen="finans-onay"><FinansOnay /></ProtectedRoute>} />
              <Route path="/finans/ceki-listesi-olustur" element={<Navigate to="/sevkiyat/ceki-listesi-olustur" replace />} />
              <Route path="/finans/ceki-listesi" element={<Navigate to="/sevkiyat/ceki-listesi" replace />} />
              <Route path="/sevkiyat/ceki-listesi-olustur" element={<ProtectedRoute screen="ceki-listesi-olustur"><CekiListesiOlustur /></ProtectedRoute>} />
              <Route path="/sevkiyat/ceki-listesi" element={<ProtectedRoute screen="ceki-listesi"><CekiListesi /></ProtectedRoute>} />
              <Route path="/raporlar/sevk-emri-raporu" element={<ProtectedRoute screen="sevk-emri-raporu"><SevkEmriRaporu /></ProtectedRoute>} />
              <Route path="/yonetim/roller" element={<ProtectedRoute screen="admin-roller"><Roller /></ProtectedRoute>} />
              <Route path="/yonetim/kullanicilar" element={<ProtectedRoute screen="admin-kullanicilar"><Kullanicilar /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}

function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Yükleniyor…</div>
  }

  if (!user && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
