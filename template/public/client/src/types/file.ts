/**
 * Client-side file attachment types.
 * Mirrors the response from POST /api/v1/files/upload and GET /api/v1/files.
 */

export interface FileAttachment {
  pk_file_attachment: string
  file_original_name: string
  file_mime_type: string
  file_size_bytes: number
  fk_file_attachment_form_submission?: string | null
  created_at?: string
}

export interface FileListParams {
  page?: number
  limit?: number
}
