import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type { SubmissionDetail } from '@/types/admin'
import type { FormSubmission, SubmissionStatus } from '@/types/form'

export interface UserSubmissionsListParams {
  page?: number
  limit?: number
  status?: SubmissionStatus
}

export interface UseUserSubmissionsReturn {
  loading: Ref<boolean>
  error: Ref<string | null>
  list: (
    params?: UserSubmissionsListParams,
  ) => Promise<{ items: FormSubmissionListItem[]; pagination: ApiPaginationInfo | null }>
  getById: (id: string) => Promise<SubmissionDetail | null>
  submitDraft: (id: string) => Promise<boolean>
  retract: (id: string) => Promise<boolean>
}

/**
 * Row shape returned by GET /api/v1/submissions — the server joins the
 * parent form_definition's form_name, so list rows carry it inline.
 */
export interface FormSubmissionListItem extends FormSubmission {
  form_name?: string
}

/**
 * Composable wrapping the authenticated user's own submission endpoints.
 * Delegates to the server's existing /api/v1/submissions routes; never
 * touches admin routes.
 */
export function useUserSubmissions(): UseUserSubmissionsReturn {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function withCall<T>(fn: () => Promise<T>): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      return await fn()
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function list(
    params: UserSubmissionsListParams = {},
  ): Promise<{ items: FormSubmissionListItem[]; pagination: ApiPaginationInfo | null }> {
    const result = await withCall(async () => {
      const res = await api.get<{
        data: FormSubmissionListItem[]
        pagination: ApiPaginationInfo
      }>('/v1/submissions', { params })
      return { items: res.data.data, pagination: res.data.pagination }
    })
    return result ?? { items: [], pagination: null }
  }

  async function getById(id: string): Promise<SubmissionDetail | null> {
    return withCall(async () => {
      const res = await api.get<{ data: SubmissionDetail }>(`/v1/submissions/${id}`)
      return res.data.data
    })
  }

  async function submitDraft(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.post(`/v1/submissions/${id}/submit`)
      return true
    })
    return result === true
  }

  async function retract(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.post(`/v1/submissions/${id}/retract`)
      return true
    })
    return result === true
  }

  return { loading, error, list, getById, submitDraft, retract }
}
