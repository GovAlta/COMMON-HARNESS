/**
 * Server-side form system type definitions.
 * These match the database column names exactly.
 */

export interface FormDefinitionRecord {
  pk_form_definition: string;
  form_name: string;
  form_version_number: number;
  form_schema: FormSchema;
  form_description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
}

export interface FormSubmissionRecord {
  pk_form_submission: string;
  fk_form_submission_form_definition: string;
  fk_form_submission_user_account: string;
  submission_data: Record<string, unknown>;
  submission_status: SubmissionStatus;
  submission_reference_number: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface FormSubmissionWithForm extends FormSubmissionRecord {
  form_name: string;
}

export interface FormSubmissionDetail extends FormSubmissionWithForm {
  form_schema: FormSchema;
  attachments: FileAttachmentRecord[];
}

export interface FileAttachmentRecord {
  pk_file_attachment: string;
  fk_file_attachment_form_submission: string | null;
  file_original_name: string;
  file_stored_name: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_data: Buffer | null;
  storage_provider_name: string;
  storage_reference_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type SubmissionStatus = 'draft' | 'submitted' | 'in-review' | 'approved' | 'rejected' | 'completed' | 'retracted';

/**
 * JSON Schema structure for dynamic form rendering.
 */
export interface FormSchema {
  title: string;
  description?: string;
  steps?: FormStep[];
  fields: FormFieldDefinition[];
}

export interface FormStep {
  title: string;
  description?: string;
  fields: string[]; // field names belonging to this step
}

export interface FormFieldDefinition {
  name: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'tel' | 'number' | 'date' | 'time' | 'select' | 'radio' | 'checkbox' | 'file' | 'url' | 'color' | 'hidden' | 'password' | 'range' | 'search' | 'month' | 'week' | 'datetime-local';
  label: string;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  validation?: FormFieldValidation;
  options?: FormFieldOption[];
  conditional?: FormFieldConditional;
}

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  enum?: string[];
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldConditional {
  field: string; // name of the field to check
  value: unknown; // value that triggers visibility
  operator?: 'equals' | 'not_equals' | 'contains' | 'not_empty';
}
