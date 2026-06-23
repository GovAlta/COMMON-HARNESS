/**
 * Client-side form definition and submission types.
 * Mirrors server/src/types/form.ts.
 */

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'in-review'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'retracted'

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'tel'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'url'
  | 'color'
  | 'hidden'
  | 'password'
  | 'range'
  | 'search'
  | 'month'
  | 'week'
  | 'datetime-local'

export interface FormFieldValidation {
  minLength?: number
  maxLength?: number
  pattern?: string
  min?: number
  max?: number
  enum?: string[]
}

export interface FormFieldOption {
  label: string
  value: string
}

export interface FormFieldConditional {
  field: string
  value: unknown
  operator?: 'equals' | 'not_equals' | 'contains' | 'not_empty'
}

export interface FormFieldDefinition {
  name: string
  type: FormFieldType
  label: string
  helpText?: string
  placeholder?: string
  required?: boolean
  validation?: FormFieldValidation
  options?: FormFieldOption[]
  conditional?: FormFieldConditional
}

export interface FormStep {
  title: string
  description?: string
  fields: string[]
}

export interface FormSchema {
  title: string
  description?: string
  steps?: FormStep[]
  fields: FormFieldDefinition[]
}

/** Public form metadata returned by GET /api/v1/forms/published. */
export interface FormMetadata {
  pk_form_definition: string
  form_name: string
  form_description: string | null
  form_version_number: number
  is_published: boolean
}

/** Full form definition returned by GET /api/v1/forms/:id/schema. */
export interface FormDefinition extends FormMetadata {
  form_schema: FormSchema
  created_at: string
  updated_at: string
}

export interface FormSubmission {
  pk_form_submission: string
  fk_form_submission_form_definition: string
  fk_form_submission_user_account: string
  submission_data: Record<string, unknown>
  submission_status: SubmissionStatus
  submission_reference_number: string
  created_at: string
  updated_at: string
}

export interface SubmitFormPayload {
  data: Record<string, unknown>
  fileIds?: string[]
}

export interface SubmitFormResult {
  submission: FormSubmission
  referenceNumber: string
}

export interface CreateFormPayload {
  form_name: string
  form_description?: string
  form_schema: FormSchema
  is_published?: boolean
}

export interface UpdateFormPayload {
  form_name?: string
  form_description?: string
  form_schema?: FormSchema
  is_published?: boolean
  form_version_number?: number
}
