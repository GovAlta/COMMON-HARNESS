import { Request, Response } from 'express';
import * as blogService from '../services/blog.service';
import { sendSuccess, sendPaginated } from '../utils/response';

// ─── Public ────────────────────────────────────────────────

export async function listPublic(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '12', 10)));
  const tag = (req.query.tag as string) || undefined;

  const { items, total } = await blogService.listPublished(page, limit, tag);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  sendPaginated(res, items, { page, limit, total, totalPages });
}

export async function getPublicBySlug(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug as string;
  const post = await blogService.findPublishedBySlug(slug);
  sendSuccess(res, post);
}

// ─── Admin ─────────────────────────────────────────────────

export async function listAllAdmin(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const publishedOnly = req.query.publishedOnly === 'true';
  const { items, total } = await blogService.listAll(page, limit, publishedOnly);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  sendPaginated(res, items, { page, limit, total, totalPages });
}

export async function getByIdAdmin(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const post = await blogService.findById(id);
  sendSuccess(res, post);
}

export async function createAdmin(req: Request, res: Response): Promise<void> {
  const actorId = req.user!.id;
  const ip = req.ip || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const post = await blogService.create(req.body, actorId, ip, ua);
  sendSuccess(res, post, 201);
}

export async function updateAdmin(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.id;
  const ip = req.ip || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const post = await blogService.update(id, req.body, actorId, ip, ua);
  sendSuccess(res, post);
}

export async function deleteAdmin(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.id;
  const ip = req.ip || null;
  const ua = (req.headers['user-agent'] as string) || null;
  await blogService.softDelete(id, actorId, ip, ua);
  res.status(204).end();
}

/**
 * POST /api/admin/blog/:id/clone
 * Clones a blog post. Title gets " (DRAFT)" appended, slug becomes
 * `${original}-draft` (with random suffix retry on UNIQUE collision), and
 * is_published is forced to false.
 */
export async function cloneAdmin(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actorId = req.user!.id;
  const ip = req.ip || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const clone = await blogService.cloneBlogPost(id, actorId, ip, ua);
  sendSuccess(res, clone, 201);
}
