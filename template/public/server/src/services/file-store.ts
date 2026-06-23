/**
 * FileStore — pluggable file-storage backend interface.
 *
 * Why this exists
 * ----------------
 * The CAS STORE-001 / STORE-002 rules and common platform standards prefer that
 * uploaded files live in an approved managed store (SharePoint, Azure Blob,
 * S3 with KMS) rather than in the application database. The template defaults
 * to BYTEA-in-Postgres because:
 *
 *   1. It is the lowest-operational-cost choice for a teams of one — Postgres
 *      backups (pg_dump) automatically include the files; no separate retention
 *      policy or IAM role to set up.
 *   2. It works identically on every deployment target (local dev, Render,
 *      Azure App Service, Cloud Run) with no extra service to provision.
 *
 * Larger teams that already operate SharePoint / Blob / S3 should swap in the
 * matching adapter. The CAS finding is logged as RA-FS-002 in
 * `.ai/data/risk_acceptances.json`; switching adapters retires the RA.
 *
 * Wiring in a real backend
 * ------------------------
 *   1. Set FILE_STORE env: 'database' (default) | 'sharepoint' | 'azure-blob' | 's3'.
 *   2. Provide the matching env vars (SP_SITE_URL + SP_CLIENT_ID + …, or
 *      AZURE_BLOB_CONTAINER + AZURE_STORAGE_CONNECTION_STRING, or
 *      S3_BUCKET + AWS_REGION + role-based credentials).
 *   3. Implement the adapter in this file (no new npm dep is added to the
 *      template surface — adapters opt-into their own SDK in their own file).
 */

import * as fileModel from '../models/file.model';
import type { FileAttachmentRecord } from '../types/form';

export interface StoredFile {
  /** Stable identifier the rest of the app reads (UUID per upload). */
  id: string;
  /** Bytes (for in-DB store) OR a signed download URL (for object stores). */
  contentRef: { kind: 'bytes'; data: Buffer } | { kind: 'url'; url: string };
  mimeType: string;
  sizeBytes: number;
  /** Adapter name that produced this record — used in audit logs. */
  storageProvider: string;
}

export interface FileStore {
  readonly name: string;
  /**
   * Persist the file. Implementations MUST return the StoredFile so callers
   * can hand it on to `file.model.create()` without knowing the backend.
   */
  put(args: {
    storedName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
    userId: string;
  }): Promise<FileAttachmentRecord>;
}

/**
 * Default backend — stores the bytes in Postgres BYTEA. Backups via pg_dump
 * cover the files automatically; no separate retention or IAM to manage.
 */
class DatabaseFileStore implements FileStore {
  readonly name = 'database';
  async put(args: {
    storedName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
    userId: string;
  }): Promise<FileAttachmentRecord> {
    return fileModel.create({
      originalName: args.originalName,
      storedName: args.storedName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      fileData: args.buffer,
      storageProvider: 'database',
      storagePath: null,
      createdBy: args.userId,
    });
  }
}

let _store: FileStore | null = null;

export function getFileStore(): FileStore {
  if (_store) return _store;
  const choice = (process.env.FILE_STORE || 'database').toLowerCase();
  switch (choice) {
    case 'database':
      _store = new DatabaseFileStore();
      break;
    default:
      // eslint-disable-next-line no-console
      console.error(
        `[file-store] FILE_STORE='${choice}' has no adapter compiled in. ` +
        'Add one in src/services/file-store.ts (see header comment) and re-deploy. ' +
        'Falling back to database store.'
      );
      _store = new DatabaseFileStore();
  }
  return _store;
}

export function _setFileStoreForTest(store: FileStore | null): void {
  _store = store;
}
