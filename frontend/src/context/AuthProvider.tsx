import { useState, type ReactNode } from 'react'

import {
  AuthContext,
  type AuthState,
  EMPTY_STATE,
  loadFromStorage,
  normalizeAuthUser,
  type AuthUser,
} from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => loadFromStorage())

  const login = (accessToken: string, user: AuthUser) => {
    const normalizedUser = normalizeAuthUser(user)
    const next: AuthState = { user: normalizedUser, accessToken }
    setState(next)
    localStorage.setItem('konesans_auth', JSON.stringify(next))
  }

  const logout = () => {
    setState(EMPTY_STATE)
    localStorage.removeItem('konesans_auth')
  }

  const updateUser = (user: AuthUser) => {
    const normalizedUser = normalizeAuthUser(user)
    setState((currentState) => {
      const next: AuthState = { ...currentState, user: normalizedUser }
      localStorage.setItem('konesans_auth', JSON.stringify(next))
      return next
    })
  }

  return (
    <AuthContext.Provider value={{ ...state, initialized: true, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}