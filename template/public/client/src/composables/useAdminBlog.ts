import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  BlogPost,
  AdminBlogListParams,
  CreateBlogPostPayload,
  UpdateBlogPostPayload,
} from '@/types/blog'

export interface UseAdminBlogReturn {
  items: Ref<BlogPost[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  list: (params?: AdminBlogListParams) => Promise<void>
  getById: (id: string) => Promise<BlogPost | null>
  create: (payload: CreateBlogPostPayload) => Promise<BlogPost | null>
  update: (id: string, payload: UpdateBlogPostPayload) => Promise<BlogPost | null>
  softDelete: (id: string) => Promise<boolean>
  clone: (id: string) => Promise<BlogPost | null>
}

/**
 * Admin blog composable. Covers the full CRUD surface over `/v1/admin/blog`.
 * Mutating calls rely on the api instance's automatic CSRF header.
 */
export function useAdminBlog(): UseAdminBlogReturn {
  const items = ref<BlogPost[]>([]) as Ref<BlogPost[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function list(params: AdminBlogListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: BlogPost[]
        pagination: ApiPaginationInfo
      }>('/v1/admin/blog', { params })
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

  async function getById(id: string): Promise<BlogPost | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: BlogPost }>(`/v1/admin/blog/${id}`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CreateBlogPostPayload): Promise<BlogPost | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.post<{ data: BlogPost }>('/v1/admin/blog', payload)
      items.value = [res.data.data, ...items.value]
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function update(
    id: string,
    payload: UpdateBlogPostPayload,
  ): Promise<BlogPost | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.put<{ data: BlogPost }>(`/v1/admin/blog/${id}`, payload)
      items.value = items.value.map((p) =>
        p.pk_blog_post === id ? res.data.data : p,
      )
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function softDelete(id: string): Promise<boolean> {
    error.value = null
    try {
      await api.delete(`/v1/admin/blog/${id}`)
      items.value = items.value.filter((p) => p.pk_blog_post !== id)
      return true
    } catch (err) {
      error.value = parseApiError(err).message
      return false
    }
  }

  /**
   * Clone an existing post. Server-side appends " (DRAFT)" to the title,
   * generates a fresh slug (with random-suffix fallback on UNIQUE collision),
   * sets is_published to false, and writes an audit row referencing the
   * original via metadata.clone_of.
   */
  async function clone(id: string): Promise<BlogPost | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.post<{ data: BlogPost }>(`/v1/admin/blog/${id}/clone`)
      items.value = [res.data.data, ...items.value]
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    pagination,
    loading,
    error,
    list,
    getById,
    create,
    update,
    softDelete,
    clone,
  }
}
