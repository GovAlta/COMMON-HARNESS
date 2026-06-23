import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { LandingPageData } from '@/types/landing'

export interface UseLandingReturn {
  data: Ref<LandingPageData | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
}

/**
 * Singleton-style composable for the landing page payload.
 * Calling `refresh()` re-fetches; `data` is null until the first response.
 */
export function useLanding(): UseLandingReturn {
  const data = ref<LandingPageData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: LandingPageData }>('/v1/landing')
      data.value = res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      data.value = null
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, refresh }
}
