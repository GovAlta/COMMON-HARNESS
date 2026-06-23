import { ref, type Ref } from 'vue'
import api from '@/lib/api'
import { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  ResourceItem,
  ResourceUpdate,
  ResourceListParams,
} from '@/types/resource'

export interface UseResourcesReturn {
  items: Ref<ResourceItem[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: ResourceListParams) => Promise<void>
  fetchOne: (id: string) => Promise<ResourceItem | null>
  fetchUpdates: (
    id: string,
    params?: { page?: number; limit?: number },
  ) => Promise<{ items: ResourceUpdate[]; pagination: ApiPaginationInfo | null }>
}

/**
 * Composable wrapping the public resources API. Returns a stable reactive
 * shape: `{items, pagination, loading, error, refresh, fetchOne, fetchUpdates}`.
 *
 * `refresh(params)` populates `items` + `pagination`. `fetchOne` and
 * `fetchUpdates` return their data directly so callers can render a single
 * record without polluting list state.
 */
export function useResources(): UseResourcesReturn {
  const items = ref<ResourceItem[]>([]) as Ref<ResourceItem[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(params: ResourceListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: ResourceItem[]
        pagination: ApiPaginationInfo
      }>('/v1/resources', { params })
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

  async function fetchOne(id: string): Promise<ResourceItem | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: ResourceItem }>(`/v1/resources/${id}`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchUpdates(
    id: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<{ items: ResourceUpdate[]; pagination: ApiPaginationInfo | null }> {
    try {
      const res = await api.get<{
        data: ResourceUpdate[]
        pagination: ApiPaginationInfo
      }>(`/v1/resources/${id}/updates`, { params })
      return { items: res.data.data, pagination: res.data.pagination }
    } catch (err) {
      error.value = parseApiError(err).message
      return { items: [], pagination: null }
    }
  }

  return { items, pagination, loading, error, refresh, fetchOne, fetchUpdates }
}
