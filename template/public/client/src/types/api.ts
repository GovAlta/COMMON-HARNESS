/**
 * Shared envelope types returned by the server's response helper.
 * Mirrors server/src/utils/response.ts — keep in sync.
 */

export interface ApiSuccessEnvelope<T> {
  success: true
  data: T
}

export interface ApiPaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiPaginatedEnvelope<T> {
  success: true
  data: T[]
  pagination: ApiPaginationInfo
}

export interface ApiErrorEnvelope {
  success: false
  error: {
    code: string
    message: string
    details?: Array<{ field?: string; message: string }>
  }
}
