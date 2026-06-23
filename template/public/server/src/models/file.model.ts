import { pool } from '../config/database';
import type { FileAttachmentRecord } from '../types/form';

/**
 * Create a new file attachment record.
 */
export async function create(data: {
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  fileData: Buffer | null;
  storageProvider: string;
  storagePath: string | null;
  createdBy: string;
}): Promise<FileAttachmentRecord> {
  const result = await pool.query<FileAttachmentRecord>(
    `INSERT INTO file_attachment (
       file_original_name,
       file_stored_name,
       file_mime_type,
       file_size_bytes,
       file_data,
       storage_provider_name,
       storage_reference_path,
       created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.originalName,
      data.storedName,
      data.mimeType,
      data.sizeBytes,
      data.fileData,
      data.storageProvider,
      data.storagePath,
      data.createdBy,
    ]
  );
  return result.rows[0];
}

/**
 * Link file attachments to a form submission.
 * Updates the FK to point to the given submission ID.
 */
export async function linkToSubmission(
  fileIds: string[],
  submissionId: string
): Promise<void> {
  if (fileIds.length === 0) return;

  // Build parameterized IN clause
  const placeholders = fileIds.map((_, i) => `$${i + 1}`).join(', ');
  const params = [...fileIds, submissionId];

  await pool.query(
    `UPDATE file_attachment
     SET fk_file_attachment_form_submission = $${fileIds.length + 1}
     WHERE pk_file_attachment IN (${placeholders})
       AND fk_file_attachment_form_submission IS NULL`,
    params
  );
}

/**
 * Find all file attachments for a given form submission.
 */
export async function findBySubmission(submissionId: string): Promise<FileAttachmentRecord[]> {
  const result = await pool.query<FileAttachmentRecord>(
    `SELECT pk_file_attachment, fk_file_attachment_form_submission, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, storage_provider_name,
            storage_reference_path, created_at, updated_at, created_by, updated_by
     FROM file_attachment
     WHERE fk_file_attachment_form_submission = $1
     ORDER BY created_at ASC`,
    [submissionId]
  );
  return result.rows;
}

/**
 * Find a single file attachment by primary key. Returns metadata + the byte
 * payload from the database BYTEA column (for FILE_STORE=database). For
 * other storage providers, file_data is null and the consumer should resolve
 * via storage_reference_path.
 */
export async function findById(
  id: string
): Promise<(FileAttachmentRecord & { file_data: Buffer | null }) | null> {
  const result = await pool.query<FileAttachmentRecord & { file_data: Buffer | null }>(
    `SELECT pk_file_attachment, fk_file_attachment_form_submission, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, storage_provider_name,
            storage_reference_path, file_data, created_at, updated_at, created_by, updated_by
     FROM file_attachment
     WHERE pk_file_attachment = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * List file attachments uploaded by a user (paginated). Returns metadata only
 * — no file_data — so the list endpoint stays light.
 */
export async function findByCreator(
  userId: string,
  page: number,
  limit: number
): Promise<{ items: FileAttachmentRecord[]; total: number }> {
  const offset = (page - 1) * limit;
  const result = await pool.query<FileAttachmentRecord & { _total_count: string }>(
    `SELECT pk_file_attachment, fk_file_attachment_form_submission, file_original_name,
            file_stored_name, file_mime_type, file_size_bytes, storage_provider_name,
            storage_reference_path, created_at, updated_at, created_by, updated_by,
            COUNT(*) OVER() AS _total_count
     FROM file_attachment
     WHERE created_by = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count, 10) : 0;
  const items = result.rows.map((row) => {
    const { _total_count: _t, ...rest } = row;
    return rest as FileAttachmentRecord;
  });
  return { items, total };
}
