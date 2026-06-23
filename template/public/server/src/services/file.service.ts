import * as crypto from 'crypto';
import * as path from 'path';
import * as fileModel from '../models/file.model';
import { AppError } from '../utils/app-error';
import {
  validateMimeType,
  isAllowedMimeType,
  validateFileSize,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../utils/file-validation';
import { getFileScanner } from './file-scanner';
import { getFileStore } from './file-store';
import type { FileAttachmentRecord } from '../types/form';

/**
 * Generate a random stored filename using UUID + original extension.
 */
export function generateStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

/**
 * Upload a file with validation.
 * Validates MIME type, magic bytes, and file size.
 * Stores in database (BYTEA) by default.
 */
export async function upload(
  file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
  },
  userId: string
): Promise<FileAttachmentRecord> {
  // Validate declared MIME type is in allowlist
  if (!isAllowedMimeType(file.mimetype)) {
    throw AppError.badRequest(
      `File type not allowed. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // Validate file size
  if (!validateFileSize(file.size)) {
    throw AppError.badRequest(
      `File size exceeds maximum of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
    );
  }

  // Validate magic bytes match declared MIME type
  if (!validateMimeType(file.buffer, file.mimetype)) {
    throw AppError.badRequest(
      'File content does not match declared file type. Possible file type mismatch.'
    );
  }

  // Malware scan via the configured FileScanner adapter (noop by default).
  // Wire in a real scanner (clamd / Defender / etc.) via the FILE_SCANNER env
  // var — see src/services/file-scanner.ts.
  const scan = await getFileScanner().scan(file.buffer, file.mimetype);
  if (!scan.clean) {
    throw AppError.badRequest(
      `File rejected: scanner '${scan.engine}' identified threat '${scan.threatName}'.`
    );
  }

  // Generate random stored name (UUID + ext — never use the client-supplied name)
  const storedName = generateStoredName(file.originalname);

  // Persist via the configured FileStore adapter (BYTEA-in-Postgres by default;
  // swap for SharePoint / Azure Blob / S3 via the FILE_STORE env var — see
  // src/services/file-store.ts).
  const attachment = await getFileStore().put({
    storedName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    buffer: file.buffer,
    userId,
  });

  return attachment;
}

/**
 * Link uploaded file attachments to a form submission.
 */
export async function linkToSubmission(
  fileIds: string[],
  submissionId: string
): Promise<void> {
  return fileModel.linkToSubmission(fileIds, submissionId);
}

/**
 * List files uploaded by a user (paginated). Metadata only — no bytes.
 */
export async function listForUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ items: FileAttachmentRecord[]; total: number }> {
  return fileModel.findByCreator(userId, page, limit);
}

/**
 * Fetch a single file for download. Authorization rules:
 *   - The uploader can always download their own file.
 *   - Admins (caller decides whether to expose) can download any file.
 *
 * Returns the metadata + byte payload from the configured store. For the
 * BYTEA store we hand back file_data directly; for external stores
 * (sharepoint/s3/blob) callers should resolve via storage_reference_path
 * instead — the byte payload will be null.
 */
export async function getForDownload(
  fileId: string,
  requesterId: string,
  isAdmin: boolean
): Promise<{
  buffer: Buffer | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storagePath: string | null;
}> {
  const file = await fileModel.findById(fileId);
  if (!file) {
    throw AppError.notFound('File not found');
  }
  if (!isAdmin && file.created_by !== requesterId) {
    // Don't leak existence of others' files — 404 (same shape as missing).
    throw AppError.notFound('File not found');
  }
  return {
    buffer: file.file_data,
    filename: file.file_original_name,
    mimeType: file.file_mime_type,
    sizeBytes: file.file_size_bytes,
    storageProvider: file.storage_provider_name,
    storagePath: file.storage_reference_path,
  };
}
