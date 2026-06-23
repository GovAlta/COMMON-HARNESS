/**
 * Client-side admin dashboard types.
 * Mirrors the DashboardStats interface in server/src/services/admin.service.ts.
 */

import type { FormDefinition, FormSubmission, SubmissionStatus } from './form'
import type { FileAttachment } from './file'

export interface DashboardTimeSeriesPoint {
  date: string
  value: number
}

export interface RecentSubmission extends FormSubmission {
  form_name: string
}

/**
 * Shape returned by GET /api/v1/admin/dashboard/stats?days=N.
 * Every field is required on the wire, but the client renders defensively
 * because individual count queries may produce zero rather than the key
 * being absent.
 */
export interface DashboardStats {
  totalResourceCount: number
  publishedResourceCount: number
  serviceLocationCount: number
  openAssistanceRequests: number
  pendingSubmissions: number
  resourcesOverTime: DashboardTimeSeriesPoint[]
  submissionsOverTime: DashboardTimeSeriesPoint[]
  recentSubmissions: RecentSubmission[]
}

export interface AdminSubmission extends FormSubmission {
  form_name?: string
  user_email?: string
  user_name?: string
}

export interface AdminSubmissionsParams {
  page?: number
  limit?: number
  formId?: string
  status?: SubmissionStatus
  startDate?: string
  endDate?: string
}

/**
 * Shape of the GET /api/v1/admin/submissions/:id response (and the
 * matching user-facing GET /api/v1/submissions/:id). Contains the
 * submission row, the parent form definition (for label rendering
 * against form_schema.fields), and the attachment metadata.
 *
 * Attachment downloads must still go through GET /api/v1/files/:id —
 * this endpoint never returns file bytes.
 */
export interface SubmissionDetail {
  submission: AdminSubmission
  form: FormDefinition
  attachments: FileAttachment[]
}
