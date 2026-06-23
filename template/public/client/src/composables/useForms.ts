import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  FormMetadata,
  FormDefinition,
  SubmitFormPayload,
  SubmitFormResult,
} from '@/types/form'

export interface FormsListParams {
  page?: number
  limit?: number
}

export interface UseFormsReturn {
  items: Ref<FormMetadata[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: FormsListParams) => Promise<void>
  getSchema: (id: string) => Promise<FormDefinition | null>
  submit: (id: string, payload: SubmitFormPayload) => Promise<SubmitFormResult | null>
}

/**
 * Composable wrapping public form metadata + authenticated schema fetch
 * + form submission. The list endpoint is paginated — `refresh(params)`
 * populates `items` + `pagination` (same shape as `useResources`).
 */
export function useForms(): UseFormsReturn {
  const items = ref<FormMetadata[]>([]) as Ref<FormMetadata[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(params: FormsListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: FormMetadata[]
        pagination: ApiPaginationInfo
      }>('/v1/forms/published', { params })
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

  async function getSchema(id: string): Promise<FormDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: FormDefinition }>(`/v1/forms/${id}/schema`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function submit(
    id: string,
    payload: SubmitFormPayload,
  ): Promise<SubmitFormResult | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.post<{ data: SubmitFormResult }>(
        `/v1/forms/${id}/submissions`,
        payload,
      )
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  return { items, pagination, loading, error, refresh, getSchema, submit }
}
