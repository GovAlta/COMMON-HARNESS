import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  ServiceWithCategory,
  ServiceListParams,
  ServiceCategory,
} from '@/types/service'

export interface UseServicesReturn {
  items: Ref<ServiceWithCategory[]>
  categories: Ref<ServiceCategory[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: ServiceListParams) => Promise<void>
  fetchOne: (id: string) => Promise<ServiceWithCategory | null>
  fetchCategories: () => Promise<void>
}

/**
 * Composable wrapping the public services API.
 */
export function useServices(): UseServicesReturn {
  const items = ref<ServiceWithCategory[]>([]) as Ref<ServiceWithCategory[]>
  const categories = ref<ServiceCategory[]>([]) as Ref<ServiceCategory[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(params: ServiceListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: ServiceWithCategory[]
        pagination: ApiPaginationInfo
      }>('/v1/services', { params })
      items.value = res.data.data
      pagination.value = res.data.pagination
    } catch (err) {
      error.value = parseApiError(err).message
      items.value = []
      pagination.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: string): Promise<ServiceWithCategory | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: ServiceWithCategory }>(`/v1/services/${id}`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchCategories(): Promise<void> {
    try {
      const res = await api.get<{ data: ServiceCategory[] }>('/v1/services/categories')
      categories.value = res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      categories.value = []
    }
  }

  return {
    items,
    categories,
    pagination,
    loading,
    error,
    refresh,
    fetchOne,
    fetchCategories,
  }
}
