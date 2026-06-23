import { pool } from '../config/database';
import type {
  FormDefinitionRecord,
  FormSubmissionRecord,
  FormSubmissionWithForm,
  FormSubmissionDetail,
  FileAttachmentRecord,
} from '../types/form';

/**
 * Find all published form definitions (metadata only, no schema), paginated.
 * Mirrors the resource model pagination contract — `LIMIT/OFFSET` is
 * parameterised so callers must pass `page` (1-indexed) and `limit`.
 */
export async function findPublished(
  page: number,
  limit: number
): Promise<FormDefinitionRecord[]> {
  const offset = (page - 1) * limit;
  const result = await pool.query<FormDefinitionRecord>(
    `SELECT pk_form_definition, form_name, form_version_number, form_description, is_published,
            created_at, updated_at
     FROM form_definition
     WHERE is_published = true AND is_deleted = false
     ORDER BY form_name ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

/**
 * Count published form definitions (for pagination metadata).
 */
export async function countPublished(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM form_definition
     WHERE is_published = true AND is_deleted = false`
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a form definition by ID (including schema).
 * Returns null if not found, unpublished, or soft-deleted.
 */
export async function findById(id: string): Promise<FormDefinitionRecord | null> {
  const result = await pool.query<FormDefinitionRecord>(
    `SELECT *
     FROM form_definition
     WHERE pk_form_definition = $1
       AND is_published = true
       AND is_deleted = false`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new form submission.
 */
export async function createSubmission(
  formId: string,
  userId: string,
  data: Record<string, unknown>,
  referenceNumber: string
): Promise<FormSubmissionRecord> {
  const result = await pool.query<FormSubmissionRecord>(
    `INSERT INTO form_submission (
       fk_form_submission_form_definition,
       fk_form_submission_user_account,
       submission_data,
       submission_reference_number,
       created_by
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [formId, userId, JSON.stringify(data), referenceNumber, userId]
  );
  return result.rows[0];
}

/**
 * Create a new draft submission (status = 'draft').
 */
export async function createDraft(
  formId: string,
  userId: string,
  data: Record<string, unknown>,
  referenceNumber: string
): Promise<FormSubmissionRecord> {
  const result = await pool.query<FormSubmissionRecord>(
    `INSERT INTO form_submission (
       fk_form_submission_form_definition,
       fk_form_submission_user_account,
       submission_data,
       submission_reference_number,
       submission_status,
       created_by
     ) VALUES ($1, $2, $3, $4, 'draft', $5)
     RETURNING *`,
    [formId, userId, JSON.stringify(data), referenceNumber, userId]
  );
  return result.rows[0];
}

/**
 * Update the submission_data of an existing submission.
 */
export async function updateSubmissionData(
  submissionId: string,
  data: Record<string, unknown>,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE form_submission
     SET submission_data = $1, updated_by = $2
     WHERE pk_form_submission = $3`,
    [JSON.stringify(data), userId, submissionId]
  );
}

/**
 * Update the status of a submission.
 */
export async function updateSubmissionStatus(
  submissionId: string,
  status: string,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE form_submission
     SET submission_status = $1, updated_by = $2
     WHERE pk_form_submission = $3`,
    [status, userId, submissionId]
  );
}

/**
 * Find submissions for a user with pagination. Joins form_definition for form name.
 */
export async function findSubmissions(
  userId: string,
  page: number,
  limit: number
): Promise<FormSubmissionWithForm[]> {
  const offset = (page - 1) * limit;
  const result = await pool.query<FormSubmissionWithForm>(
    `SELECT
       fs.*,
       fd.form_name
     FROM form_submission fs
     JOIN form_definition fd ON fs.fk_form_submission_form_definition = fd.pk_form_definition
     WHERE fs.fk_form_submission_user_account = $1
     ORDER BY fs.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

/**
 * Count submissions for a user (for pagination metadata).
 */
export async function countSubmissions(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM form_submission
     WHERE fk_form_submission_user_account = $1`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a single submission by ID with form name, schema, and attachments.
 */
export async function findSubmission(id: string): Promise<FormSubmissionDetail | null> {
  const submissionResult = await pool.query<FormSubmissionWithForm & { form_schema: any }>(
    `SELECT
       fs.*,
       fd.form_name,
       fd.form_schema
     FROM form_submission fs
     JOIN form_definition fd ON fs.fk_form_submission_form_definition = fd.pk_form_definition
     WHERE fs.pk_form_submission = $1`,
    [id]
  );

  if (submissionResult.rows.length === 0) {
    return null;
  }

  const submission = submissionResult.rows[0];

  // Get file attachments
  const attachmentResult = await pool.query<FileAttachmentRecord>(
    `SELECT pk_file_attachment, fk_file_attachment_form_submission, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, storage_provider_name,
            storage_reference_path, created_at, updated_at, created_by, updated_by
     FROM file_attachment
     WHERE fk_file_attachment_form_submission = $1
     ORDER BY created_at ASC`,
    [id]
  );

  return {
    ...submission,
    attachments: attachmentResult.rows,
  };
}
