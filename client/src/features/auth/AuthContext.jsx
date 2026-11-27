import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { authRequest, onUnauthorized } from '../../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', user: null, error: '' })
  const generation = useRef(0)
  const signOut = useCallback(() => {
    generation.current += 1
    setSession({ status: 'anonymous', user: null, error: '' })
  }, [])

  const restore = useCallback(async (signal) => {
    const current = ++generation.current
    setSession(previous => ({ ...previous, status: 'loading', error: '' }))
    try {
      const { user } = await authRequest('me', { signal })
      if (current === generation.current) setSession({ status: 'authenticated', user, error: '' })
    } catch (error) {
      if (signal?.aborted || current !== generation.current) return
      if (error.status === 401) signOut()
      else setSession(previous => ({ ...previous, status: 'unavailable', error: error.message }))
    }
  }, [signOut])

  useEffect(() => {
    const controller = new AbortController()
    void restore(controller.signal)
    const unsubscribe = onUnauthorized(signOut)
    // A page restored from the browser's Back/Forward cache must recheck its session.
    const recheck = () => { void restore(controller.signal) }
    window.addEventListener('pageshow', recheck)
    return () => {
      controller.abort()
      unsubscribe()
      window.removeEventListener('pageshow', recheck)
    }
  }, [restore, signOut])

  async function authenticate(mode, body) {
    const { user } = await authRequest(mode, { method: 'POST', body })
    generation.current += 1
    setSession({ status: 'authenticated', user, error: '' })
  }

  async function logout() {
    await authRequest('logout', { method: 'POST' })
    signOut()
  }

  return <AuthContext.Provider value={{ ...session, restore, authenticate, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth requires AuthProvider')
  return context
}
