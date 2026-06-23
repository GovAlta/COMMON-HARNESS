import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type { BlogPost, BlogListParams } from '@/types/blog'

export interface UseBlogReturn {
  items: Ref<BlogPost[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  list: (params?: BlogListParams) => Promise<void>
  getBySlug: (slug: string) => Promise<BlogPost | null>
}

/**
 * Public blog composable. Reads from `/v1/blog` (published posts only).
 */
export function useBlog(): UseBlogReturn {
  const items = ref<BlogPost[]>([]) as Ref<BlogPost[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function list(params: BlogListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: BlogPost[]
        pagination: ApiPaginationInfo
      }>('/v1/blog', { params })
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

  async function getBySlug(slug: string): Promise<BlogPost | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: BlogPost }>(`/v1/blog/${encodeURIComponent(slug)}`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  return { items, pagination, loading, error, list, getBySlug }
}
