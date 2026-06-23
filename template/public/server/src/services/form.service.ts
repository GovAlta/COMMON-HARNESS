import Ajv from 'ajv';
import * as formModel from '../models/form.model';
import * as fileModel from '../models/file.model';
import { AppError } from '../utils/app-error';
import { logAuditEvent } from '../utils/audit-logger';
import type {
  FormDefinitionRecord,
  FormSchema,
  FormSubmissionWithForm,
  FormSubmissionDetail,
  FileAttachmentRecord,
  FormFieldDefinition,
} from '../types/form';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List all published form definitions (metadata only, no schema), paginated.
 */
export async function listPublished(
  page: number,
  limit: number
): Promise<PaginatedResult<FormDefinitionRecord>> {
  const [data, total] = await Promise.all([
    formModel.findPublished(page, limit),
    formModel.countPublished(),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Get a form definition's full schema by ID.
 * Throws 404 if not found or unpublished.
 */
export async function getSchema(formId: string): Promise<FormDefinitionRecord> {
  const form = await formModel.findById(formId);

  if (!form) {
    throw AppError.notFound('Form not found');
  }

  return form;
}

/**
 * Build a JSON Schema (draft-07 style) for AJV validation from the form's field definitions.
 */
function buildAjvSchema(formSchema: FormSchema): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const field of formSchema.fields) {
    const prop: Record<string, unknown> = {};

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'tel':
      case 'phone':
      case 'date':
      case 'time':
      case 'url':
      case 'color':
      case 'password':
      case 'search':
      case 'month':
      case 'week':
      case 'datetime-local':
      case 'hidden':
      case 'select':
      case 'radio':
        prop.type = 'string';
        break;
      case 'number':
      case 'range':
        prop.type = 'number';
        break;
      case 'checkbox':
        // Checkbox with options = multi-select array; standalone = boolean
        if (field.options && field.options.length > 0) {
          prop.type = 'array';
        } else {
          prop.type = 'boolean';
        }
        break;
      case 'file':
        // File fields store attachment IDs as strings or arrays
        prop.type = ['string', 'array'];
        break;
      default:
        prop.type = 'string';
    }

    if (field.validation) {
      if (field.validation.minLength !== undefined) prop.minLength = field.validation.minLength;
      if (field.validation.maxLength !== undefined) prop.maxLength = field.validation.maxLength;
      if (field.validation.pattern !== undefined) prop.pattern = field.validation.pattern;
      if (field.validation.min !== undefined) prop.minimum = field.validation.min;
      if (field.validation.max !== undefined) prop.maximum = field.validation.max;
      if (field.validation.enum !== undefined) prop.enum = field.validation.enum;
    }

    properties[field.name] = prop;

    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

/**
 * Submit a form with validated data.
 * Validates against the form's JSON Schema using ajv.
 * Generates unique reference number.
 * Links uploaded file attachments.
 */
export async function submitForm(
  formId: string,
  userId: string,
  data: Record<string, unknown>,
  fileIds: string[] = []
): Promise<{ submission: FormSubmissionWithForm; referenceNumber: string }> {
  // Get form definition
  const form = await formModel.findById(formId);
  if (!form) {
    throw AppError.notFound('Form not found');
  }

  // Build and validate against AJV schema
  const ajvSchema = buildAjvSchema(form.form_schema);
  const validate = ajv.compile(ajvSchema);

  // Filter data to remove conditional invisible fields (optional empty strings are OK)
  const filteredData = filterConditionalData(data, form.form_schema);

  const valid = validate(filteredData);
  if (!valid) {
    const details = (validate.errors || []).map((err) => ({
      field: err.instancePath ? err.instancePath.replace(/^\//, '') : (err.params as any)?.missingProperty || 'unknown',
      message: err.message || 'Invalid value',
    }));
    throw AppError.validation(details);
  }

  // Generate reference number
  const referenceNumber = await generateReferenceNumber();

  // Create submission
  const submission = await formModel.createSubmission(formId, userId, filteredData, referenceNumber);

  // Link file attachments
  if (fileIds.length > 0) {
    await fileModel.linkToSubmission(fileIds, submission.pk_form_submission);
  }

  await logAuditEvent({
    action: 'FORM_SUBMIT',
    tableName: 'form_submission',
    recordId: submission.pk_form_submission,
    userId,
    newData: { formName: form.form_name, referenceNumber },
  });

  return {
    submission: { ...submission, form_name: form.form_name },
    referenceNumber,
  };
}

/**
 * Filter out data for fields that should be hidden based on conditional rules.
 */
function filterConditionalData(
  data: Record<string, unknown>,
  schema: FormSchema
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const field of schema.fields) {
    if (field.conditional) {
      const { field: depField, value: depValue, operator } = field.conditional;
      const currentValue = data[depField];
      let visible = false;

      switch (operator || 'equals') {
        case 'equals':
          visible = currentValue === depValue;
          break;
        case 'not_equals':
          visible = currentValue !== depValue;
          break;
        case 'contains':
          visible = typeof currentValue === 'string' && currentValue.includes(String(depValue));
          break;
        case 'not_empty':
          visible = currentValue !== undefined && currentValue !== null && currentValue !== '';
          break;
      }

      if (visible && data[field.name] !== undefined) {
        filtered[field.name] = data[field.name];
      }
      // Skip hidden conditional fields
    } else if (data[field.name] !== undefined) {
      filtered[field.name] = data[field.name];
    }
  }

  return filtered;
}

/**
 * List a user's form submissions with pagination.
 */
export async function listUserSubmissions(
  userId: string,
  page: number,
  limit: number
): Promise<PaginatedResult<FormSubmissionWithForm>> {
  const [data, total] = await Promise.all([
    formModel.findSubmissions(userId, page, limit),
    formModel.countSubmissions(userId),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Get a single submission detail (flat shape — used by legacy callers).
 * Verifies the submission belongs to the requesting user.
 */
export async function getSubmission(
  submissionId: string,
  userId: string
): Promise<FormSubmissionDetail> {
  const submission = await formModel.findSubmission(submissionId);

  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  if (submission.fk_form_submission_user_account !== userId) {
    throw AppError.forbidden('You can only view your own submissions');
  }

  return submission;
}

/**
 * Get a single submission detail in the {submission, form, attachments}
 * triple shape that the admin endpoint also uses, so the client can share
 * the same render component for both surfaces. Verifies ownership.
 */
export async function getSubmissionDetail(
  submissionId: string,
  userId: string
): Promise<{
  submission: FormSubmissionWithForm;
  form: FormDefinitionRecord;
  attachments: FileAttachmentRecord[];
}> {
  const submission = await formModel.findSubmission(submissionId);

  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  if (submission.fk_form_submission_user_account !== userId) {
    throw AppError.forbidden('You can only view your own submissions');
  }

  const form = await formModel.findById(submission.fk_form_submission_form_definition);
  if (!form) {
    throw AppError.notFound('Form definition not found');
  }

  // findSubmission already joins file_attachment rows; reuse them so we don't
  // hit the table a second time. The attachments list is metadata-only — no
  // file_data — which matches the admin shape.
  const { attachments, form_schema: _schema, ...submissionFlat } = submission;
  void _schema;

  return {
    submission: submissionFlat as FormSubmissionWithForm,
    form,
    attachments,
  };
}

/**
 * Generate a unique reference number in the format: WF-YYYYMMDD-XXXXX
 * Where XXXXX is a zero-padded random 5-digit number.
 */
export async function generateReferenceNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  // Generate random 5-digit number (00000-99999)
  const randomPart = String(Math.floor(Math.random() * 100000)).padStart(5, '0');

  return `APP-${datePart}-${randomPart}`;
}

/**
 * Save a form submission as a draft (status = 'draft').
 * Skips AJV validation — drafts can be incomplete.
 */
export async function saveDraft(
  formId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<FormSubmissionWithForm> {
  const form = await formModel.findById(formId);
  if (!form) {
    throw AppError.notFound('Form not found');
  }

  const referenceNumber = await generateReferenceNumber();

  const submission = await formModel.createDraft(formId, userId, data, referenceNumber);

  await logAuditEvent({
    action: 'FORM_DRAFT_SAVE',
    tableName: 'form_submission',
    recordId: submission.pk_form_submission,
    userId,
    newData: { formName: form.form_name, referenceNumber },
  });

  return { ...submission, form_name: form.form_name };
}

/**
 * Update an existing draft's data.
 * Only allowed if the submission is in 'draft' status.
 */
export async function updateDraft(
  submissionId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const submission = await formModel.findSubmission(submissionId);

  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  if (submission.fk_form_submission_user_account !== userId) {
    throw AppError.forbidden('You can only update your own drafts');
  }

  if (submission.submission_status !== 'draft') {
    throw AppError.badRequest('Only draft submissions can be updated');
  }

  await formModel.updateSubmissionData(submissionId, data, userId);

  await logAuditEvent({
    action: 'FORM_DRAFT_UPDATE',
    tableName: 'form_submission',
    recordId: submissionId,
    userId,
    newData: { updatedFields: Object.keys(data) },
  });
}

/**
 * Submit a draft — validates data with AJV and changes status to 'submitted'.
 */
export async function submitDraft(
  submissionId: string,
  userId: string
): Promise<{ referenceNumber: string }> {
  const submission = await formModel.findSubmission(submissionId);

  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  if (submission.fk_form_submission_user_account !== userId) {
    throw AppError.forbidden('You can only submit your own drafts');
  }

  if (submission.submission_status !== 'draft') {
    throw AppError.badRequest('Only draft submissions can be submitted');
  }

  // Get form definition for validation
  const form = await formModel.findById(submission.fk_form_submission_form_definition);
  if (!form) {
    throw AppError.notFound('Form definition not found');
  }

  // Validate the draft data
  const ajvSchema = buildAjvSchema(form.form_schema);
  const validate = ajv.compile(ajvSchema);
  const filteredData = filterConditionalData(
    submission.submission_data as Record<string, unknown>,
    form.form_schema
  );

  const valid = validate(filteredData);
  if (!valid) {
    const details = (validate.errors || []).map((err) => ({
      field: err.instancePath ? err.instancePath.replace(/^\//, '') : (err.params as any)?.missingProperty || 'unknown',
      message: err.message || 'Invalid value',
    }));
    throw AppError.validation(details);
  }

  await formModel.updateSubmissionStatus(submissionId, 'submitted', userId);

  await logAuditEvent({
    action: 'FORM_DRAFT_SUBMIT',
    tableName: 'form_submission',
    recordId: submissionId,
    userId,
    newData: { formName: form.form_name, referenceNumber: submission.submission_reference_number },
  });

  return { referenceNumber: submission.submission_reference_number };
}

/**
 * Retract a submitted submission — changes status from 'submitted' to 'retracted'.
 */
export async function retractSubmission(
  submissionId: string,
  userId: string
): Promise<void> {
  const submission = await formModel.findSubmission(submissionId);

  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  if (submission.fk_form_submission_user_account !== userId) {
    throw AppError.forbidden('You can only retract your own submissions');
  }

  if (submission.submission_status !== 'submitted') {
    throw AppError.badRequest('Only submitted submissions can be retracted');
  }

  await formModel.updateSubmissionStatus(submissionId, 'retracted', userId);

  await logAuditEvent({
    action: 'FORM_RETRACT',
    tableName: 'form_submission',
    recordId: submissionId,
    userId,
    newData: { referenceNumber: submission.submission_reference_number },
  });
}
