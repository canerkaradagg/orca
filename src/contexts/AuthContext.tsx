import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface UserInfo {
  userId: number
  email: string
  displayName: string
  isExternal: boolean
  roles: string[]
}

interface ScreenPermission {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
}

interface AuthState {
  user: UserInfo | null
  permissions: Record<string, ScreenPermission>
  token: string | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasPermission: (screenCode: string, perm?: 'canView' | 'canEdit' | 'canDelete') => boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'orca_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    permissions: {},
    token: localStorage.getItem(TOKEN_KEY),
    loading: true,
  })

  const setToken = useCallback((token: string | null) => {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setState({ user: null, permissions: {}, token: null, loading: false })
  }, [])

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text()
    if (!text || !text.trim()) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }, [])

  const fetchMe = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { logout(); return }
      const data = await safeJson(res)
      if (!data?.ok) { logout(); return }
      setState({
        user: data.user,
        permissions: data.permissions || {},
        token,
        loading: false,
      })
    } catch {
      logout()
    }
  }, [logout, safeJson])

  useEffect(() => {
    if (state.token) fetchMe(state.token)
    else setState(s => ({ ...s, loading: false }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await safeJson(res)
    if (!data) throw new Error('Sunucu yanıt vermedi. API sunucusunun çalıştığından emin olun (npm run db:serve veya npm run dev:full).')
    if (!data.ok) throw new Error(data.error || 'Giriş başarısız.')
    setToken(data.token)
    setState({
      user: data.user,
      permissions: data.permissions || {},
      token: data.token,
      loading: false,
    })
  }, [setToken, safeJson])

  const hasPermission = useCallback((screenCode: string, perm: 'canView' | 'canEdit' | 'canDelete' = 'canView') => {
    if (!state.permissions) return false
    const sp = state.permissions[screenCode]
    return sp ? !!sp[perm] : false
  }, [state.permissions])

  const isAdmin = state.user?.roles?.includes('Admin') ?? false

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
