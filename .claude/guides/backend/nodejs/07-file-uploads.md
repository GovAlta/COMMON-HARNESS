# Skill 07: File Upload Security

> Implement secure file uploads with multer, magic byte validation, MIME allowlist, and PostgreSQL BYTEA storage.

## Route Configuration

Configure multer with memory storage (no temp files on disk), a size limit, and a single-file constraint:

```typescript
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { asyncHandler } from '../utils/async-handler';
import * as controller from '../controllers/file.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,                    // Single file only
  },
});

const router = Router();

router.post(
  '/upload',
  authenticate,
  csrf,
  upload.single('file'),
  asyncHandler(controller.uploadFile)
);

router.get('/:id', asyncHandler(controller.getFile));

export default router;
```

## Validation Pipeline

The upload passes through multiple layers, each responsible for a specific check:

```
multer (size limit, single file)
  -> controller (file presence check)
    -> service (MIME allowlist -> magic bytes -> size recheck)
      -> model (UUID rename -> BYTEA insert)
```

## MIME Type Allowlist

Only explicitly approved types are accepted. This is an allowlist, never a blocklist:

```typescript
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}
```

## Magic Byte Signatures

Never trust the declared MIME type from the client. Verify the actual file content by checking magic bytes at the start of the buffer:

```typescript
interface MagicBytePattern {
  mimeType: AllowedMimeType;
  bytes: number[];
  offset?: number;
  additionalCheck?: (buffer: Buffer) => boolean;
}

const MAGIC_BYTE_PATTERNS: MagicBytePattern[] = [
  {
    mimeType: 'image/jpeg',
    bytes: [0xff, 0xd8, 0xff],
  },
  {
    mimeType: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    mimeType: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46], // RIFF header
    additionalCheck: (buffer: Buffer) => {
      // Bytes 8-11 must be "WEBP"
      return buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP';
    },
  },
  {
    mimeType: 'application/pdf',
    bytes: [0x25, 0x50, 0x44, 0x46], // %PDF
  },
];
```

## Magic Byte Detection Function

```typescript
export function detectMimeType(buffer: Buffer): string | null {
  for (const pattern of MAGIC_BYTE_PATTERNS) {
    const offset = pattern.offset || 0;

    if (buffer.length < offset + pattern.bytes.length) continue;

    const matches = pattern.bytes.every(
      (byte, index) => buffer[offset + index] === byte
    );

    if (matches) {
      // Run additional check if defined (e.g., WebP RIFF verification)
      if (pattern.additionalCheck && !pattern.additionalCheck(buffer)) {
        continue;
      }
      return pattern.mimeType;
    }
  }

  return null;
}
```

## Full Validation Logic

The declared MIME type must be in the allowlist, and the actual file content must match:

```typescript
export function validateMimeType(buffer: Buffer, declaredType: string): boolean {
  // 1. Check declared type is in the allowlist
  if (!isAllowedMimeType(declaredType)) return false;

  // 2. Detect actual type from magic bytes
  const detected = detectMimeType(buffer);

  // 3. Actual content must match declared type
  return detected === declaredType;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}
```

## UUID Rename for Storage

Never use the original filename. Generate a UUID-based name to prevent path traversal attacks:

```typescript
import crypto from 'crypto';
import path from 'path';

export function generateStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}
```

## Service Layer with Full Validation Chain

The service orchestrates every validation step before persisting:

```typescript
import { AppError } from '../utils/errors';
import * as fileModel from '../models/file.model';
import {
  isAllowedMimeType,
  validateMimeType,
  validateFileSize,
  generateStoredName,
} from '../utils/file-validation';

interface FileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface FileAttachmentRecord {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: Date;
}

export async function upload(
  file: FileData,
  userId: string
): Promise<FileAttachmentRecord> {
  // 1. MIME allowlist check
  if (!isAllowedMimeType(file.mimetype)) {
    throw AppError.badRequest(
      `File type not allowed. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // 2. Size check (defense in depth; multer also checks)
  if (!validateFileSize(file.size)) {
    throw AppError.badRequest('File too large (max 10MB)');
  }

  // 3. Magic byte validation: actual content must match declared type
  if (!validateMimeType(file.buffer, file.mimetype)) {
    throw AppError.badRequest(
      'File content does not match declared type'
    );
  }

  // 4. Generate a safe stored name
  const storedName = generateStoredName(file.originalname);

  // 5. Persist to database
  return fileModel.create({
    originalName: file.originalname,
    storedName,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    fileData: file.buffer, // Stored as BYTEA in PostgreSQL
    storageProvider: 'database',
    createdBy: userId,
  });
}
```

## Controller

```typescript
import { Request, Response } from 'express';
import * as fileService from '../services/file.service';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/errors';

export async function uploadFile(req: Request, res: Response): Promise<void> {
  // Check that multer received a file
  if (!req.file) {
    throw AppError.badRequest('No file provided');
  }

  const userId = req.user!.id;
  const result = await fileService.upload(req.file, userId);

  sendSuccess(res, {
    id: result.id,
    originalName: result.originalName,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    createdAt: result.createdAt,
  }, 201);
}

export async function getFile(req: Request, res: Response): Promise<void> {
  const file = await fileService.getById(req.params.id);

  if (!file) {
    throw AppError.notFound('File not found');
  }

  // Set the correct Content-Type so browsers handle the file properly
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', file.sizeBytes.toString());
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${file.originalName}"`
  );

  res.send(file.fileData);
}
```

## PostgreSQL BYTEA Storage

### Migration

```sql
CREATE TABLE file_attachment (
  pk_file_attachment UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name      VARCHAR(255) NOT NULL,
  stored_name        VARCHAR(255) NOT NULL UNIQUE,
  mime_type          VARCHAR(100) NOT NULL,
  size_bytes         INTEGER NOT NULL,
  file_data          BYTEA NOT NULL,
  storage_provider   VARCHAR(50) NOT NULL DEFAULT 'database',
  created_by         UUID NOT NULL REFERENCES user_account(pk_user_account),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_file_attachment_created_by ON file_attachment(created_by);
```

### Model

```typescript
import pool from '../config/database';

interface CreateFileInput {
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  fileData: Buffer;
  storageProvider: string;
  createdBy: string;
}

export async function create(input: CreateFileInput) {
  const result = await pool.query(
    `INSERT INTO file_attachment
       (original_name, stored_name, mime_type, size_bytes, file_data, storage_provider, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING pk_file_attachment AS id, original_name, stored_name, mime_type,
               size_bytes, storage_provider, created_by, created_at`,
    [
      input.originalName,
      input.storedName,
      input.mimeType,
      input.sizeBytes,
      input.fileData,
      input.storageProvider,
      input.createdBy,
    ]
  );

  return result.rows[0];
}

export async function getById(id: string) {
  const result = await pool.query(
    `SELECT pk_file_attachment AS id, original_name AS "originalName",
            stored_name AS "storedName", mime_type AS "mimeType",
            size_bytes AS "sizeBytes", file_data AS "fileData",
            created_by AS "createdBy", created_at AS "createdAt"
     FROM file_attachment
     WHERE pk_file_attachment = $1`,
    [id]
  );

  return result.rows[0] || null;
}
```

## Security Properties Summary

1. **Never trust the declared MIME type** -- always verify with magic bytes against the actual file content
2. **Never use the original filename for storage** -- UUID naming prevents path traversal and overwrites
3. **Reject unexpected file types** -- use an allowlist (not a blocklist) of MIME types
4. **Size limit at both multer and service layer** -- defense in depth; if one layer is bypassed, the other catches it
5. **No HTML or JavaScript in the allowlist** -- prevents stored XSS when files are served back to users
6. **File data stored in PostgreSQL BYTEA** -- no filesystem access needed, eliminating directory traversal entirely
7. **Content-Type set from stored metadata on retrieval** -- the file is served with the type that was validated at upload time
