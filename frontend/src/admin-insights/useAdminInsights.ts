import { useCallback, useEffect, useState } from 'react'
import { getAdminInsights } from './adminInsightsApi'
import type { AdminInsights } from './types'

export function useAdminInsights(token: string | null) {
  const [data, setData] = useState<AdminInsights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      setData(await getAdminInsights(token))
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Impossible de charger les indicateurs administrateur.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  return { data, loading, error, refresh }
}
