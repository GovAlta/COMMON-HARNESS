import { Request, Response } from 'express';
import * as fileService from '../services/file.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { AppError } from '../utils/app-error';

/**
 * POST /api/files/upload
 * Upload a file with validation.
 * Accepts multipart/form-data via multer.
 * Requires authentication + CSRF.
 */
export async function uploadFile(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'No file provided' },
    });
    return;
  }

  const userId = req.user!.id;

  const attachment = await fileService.upload(
    {
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    },
    userId
  );

  sendSuccess(res, {
    pk_file_attachment: attachment.pk_file_attachment,
    file_original_name: attachment.file_original_name,
    file_mime_type: attachment.file_mime_type,
    file_size_bytes: attachment.file_size_bytes,
  }, 201);
}

/**
 * GET /api/files
 * List the current user's uploaded files (paginated).
 */
export async function listMyFiles(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));

  const { items, total } = await fileService.listForUser(userId, page, limit);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Strip file_data from the list response (model already does, but be defensive).
  const safe = items.map((f) => ({
    pk_file_attachment: f.pk_file_attachment,
    file_original_name: f.file_original_name,
    file_mime_type: f.file_mime_type,
    file_size_bytes: f.file_size_bytes,
    fk_file_attachment_form_submission: f.fk_file_attachment_form_submission,
    created_at: f.created_at,
  }));

  sendPaginated(res, safe, { page, limit, total, totalPages });
}

/**
 * GET /api/files/:id
 * Download a file. Streams the bytes from the BYTEA store (default) with
 * Content-Type + Content-Disposition headers. Admins can download any file;
 * uploaders can download their own.
 */
export async function downloadFile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  // 'isAdmin' here is whether the request's role meets/exceeds 'admin' on
  // the ROLE_HIERARCHY. The authorize middleware does the deep check; we
  // surface the boolean for the service-level visibility rule.
  const role = req.user!.role || '';
  const isAdmin = role === 'admin' || role === 'super_admin';

  const id = req.params.id as string;
  if (!id) throw AppError.badRequest('File id is required');

  const f = await fileService.getForDownload(id, userId, isAdmin);

  // External storage providers (sharepoint/s3/azure-blob) won't have inline
  // bytes — the consumer should resolve via storage_reference_path. Surface
  // a 501 so the caller can swap to a redirect/presigned-url flow when the
  // template is wired to one of those adapters.
  if (!f.buffer) {
    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Download from storage provider '${f.storageProvider}' is not wired. Inline download only works for the BYTEA-in-database store. Reference path: ${f.storagePath ?? '(none)'}`,
      },
    });
    return;
  }

  // RFC 5987 filename* for non-ASCII filenames; ASCII fallback in filename.
  const asciiFallback = f.filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(f.filename);
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Length', String(f.sizeBytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
  );
  // Defence-in-depth: explicitly mark downloads as non-rendered.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.buffer);
}
