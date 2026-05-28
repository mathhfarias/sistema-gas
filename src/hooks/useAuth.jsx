import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const profileLoadedRef = useRef(false)

  useEffect(() => {
    // Busca sessão atual uma única vez
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listener apenas para SIGNED_IN e SIGNED_OUT — ignora eventos duplicados
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] evento:', event)

      if (event === 'SIGNED_OUT') {
        profileLoadedRef.current = false
        setUser(null)
        setProfile(null)
        setLoading(false)
      }

      if (event === 'SIGNED_IN' && session?.user && !profileLoadedRef.current) {
        setUser(session.user)
        fetchProfile(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    if (profileLoadedRef.current) return
    profileLoadedRef.current = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[Auth] Erro ao buscar profile:', error.message)
        setProfile(null)
      } else {
        console.log('[Auth] Profile OK:', data?.full_name, '| role:', data?.role)
        setProfile(data)
      }
    } catch (err) {
      console.error('[Auth] Erro inesperado:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    profileLoadedRef.current = false // reseta ao fazer novo login
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
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