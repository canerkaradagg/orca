import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './Login.module.css'

export function Login() {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <img src="/logo/OlkaGroup.png" alt="Olka Group" className={styles.logo} />
          <h1 className={styles.brandTitle}>ORCA</h1>
          <p className={styles.brandSubtitle}>Order & Resource Control Application</p>
        </div>
      </div>
      <div className={styles.rightPanel}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2 className={styles.formTitle}>Giriş Yap</h2>
          <p className={styles.formSubtitle}>Devam etmek için hesabınıza giriş yapın</p>

          {error && <div className={styles.error}>{error}</div>}

          <label className={styles.label}>
            <span>E-posta</span>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ornek@olka.com.tr"
              required
              autoFocus
              autoComplete="email"
            />
          </label>

          <label className={styles.label}>
            <span>Şifre</span>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>

          <button type="submit" className={styles.button} disabled={submitting}>
            {submitting ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>
        <p className={styles.footer}>Olka Group &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
