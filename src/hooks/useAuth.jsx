import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const profileLoadedForRef = useRef(null)
  const currentUserIdRef = useRef(null)
  const lastAuthSignatureRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function handleSession(session, event = 'SESSION') {
      if (cancelled) return

      const nextUser = session?.user || null
      const signature = `${event}:${nextUser?.id || 'anonymous'}`

      if (signature === lastAuthSignatureRef.current && event !== 'SIGNED_OUT') {
        return
      }
      lastAuthSignatureRef.current = signature

      if (!nextUser) {
        currentUserIdRef.current = null
        profileLoadedForRef.current = null
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      currentUserIdRef.current = nextUser.id
      setUser(nextUser)
      await fetchProfile(nextUser.id)
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => handleSession(session, 'INITIAL_SESSION'))
      .catch((err) => {
        console.error('[Auth] Erro ao buscar sessão:', err?.message || err)
        if (!cancelled) setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return
      handleSession(session, event)
    })

    return () => {
      cancelled = true
      mountedRef.current = false
      data?.subscription?.unsubscribe?.()
    }
  }, [])

  async function fetchProfile(userId) {
    if (!userId) return
    if (profileLoadedForRef.current === userId) {
      if (mountedRef.current) setLoading(false)
      return
    }

    profileLoadedForRef.current = userId

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', userId)
        .single()

      if (!mountedRef.current || currentUserIdRef.current !== userId) return

      if (error) {
        console.error('[Auth] Erro ao buscar profile:', error.message)
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (err) {
      if (mountedRef.current && currentUserIdRef.current === userId) {
        console.error('[Auth] Erro inesperado:', err)
        setProfile(null)
      }
    } finally {
      if (mountedRef.current && currentUserIdRef.current === userId) {
        setLoading(false)
      }
    }
  }

  async function signIn(email, password) {
    profileLoadedForRef.current = null
    lastAuthSignatureRef.current = null
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    profileLoadedForRef.current = null
    lastAuthSignatureRef.current = null
    currentUserIdRef.current = null
    await supabase.auth.signOut()
  }

  const value = { user, profile, loading, signIn, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
