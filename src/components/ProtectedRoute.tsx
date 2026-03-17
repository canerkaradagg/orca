import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
  screen?: string
}

export function ProtectedRoute({ children, screen }: Props) {
  const { user, loading, hasPermission } = useAuth()

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (screen && !hasPermission(screen)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#c62828' }}>
        <h2>Erişim Engellendi</h2>
        <p>Bu ekranı görüntüleme yetkiniz bulunmamaktadır.</p>
      </div>
    )
  }

  return <>{children}</>
}
