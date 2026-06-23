import { ref, watch, toValue, type Ref } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import api from '@/lib/api'

export interface UseFetchReturn<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}

export function useFetch<T = unknown>(url: MaybeRefOrGetter<string>): UseFetchReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function fetchData() {
    loading.value = true
    error.value = null
    try {
      const response = await api.get<T>(toValue(url))
      data.value = response.data
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      loading.value = false
    }
  }

  // Watch for URL changes and re-fetch
  watch(() => toValue(url), fetchData, { immediate: true })

  return { data, loading, error, refresh: fetchData }
}
