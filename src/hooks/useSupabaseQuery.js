import { useState, useEffect, useCallback } from 'react'

/**
 * Hook genérico para buscar dados do Supabase.
 * @param {Function} fetcher - função async que retorna { data, error }
 * @param {Array} deps - dependências para re-fetch
 */
export function useSupabaseQuery(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (result?.error) throw result.error
      setData(result?.data ?? result)
    } catch (err) {
      setError(err?.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}
