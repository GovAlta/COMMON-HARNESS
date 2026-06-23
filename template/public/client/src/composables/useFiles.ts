import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type { FileAttachment, FileListParams } from '@/types/file'

export interface UseFilesReturn {
  /** Server-backed list of the current user's uploaded files (paginated). */
  items: Ref<FileAttachment[]>
  pagination: Ref<ApiPaginationInfo | null>
  /** Local marker for files uploaded during this session so the UI can flag them. */
  uploadedThisSession: Ref<Set<string>>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: FileListParams) => Promise<void>
  upload: (file: File) => Promise<FileAttachment | null>
  /** Path the browser can hit directly to download a file; no axios round-trip. */
  downloadUrl: (id: string) => string
  reset: () => void
}

/**
 * Composable wrapping the user's file API. Lists, uploads, and exposes
 * a direct-download URL the browser can hit through an anchor element
 * (axios is unsuitable for binary streams).
 */
export function useFiles(): UseFilesReturn {
  const items = ref<FileAttachment[]>([]) as Ref<FileAttachment[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const uploadedThisSession = ref<Set<string>>(new Set())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(params: FileListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: FileAttachment[]
        pagination: ApiPaginationInfo
      }>('/v1/files', { params })
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

  async function upload(file: File): Promise<FileAttachment | null> {
    loading.value = true
    error.value = null
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<{ data: FileAttachment }>(
        '/v1/files/upload',
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120_000,
        },
      )
      uploadedThisSession.value.add(res.data.data.pk_file_attachment)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  function downloadUrl(id: string): string {
    return `/api/v1/files/${id}`
  }

  function reset(): void {
    items.value = []
    pagination.value = null
    uploadedThisSession.value = new Set()
    error.value = null
  }

  return {
    items,
    pagination,
    uploadedThisSession,
    loading,
    error,
    refresh,
    upload,
    downloadUrl,
    reset,
  }
}
