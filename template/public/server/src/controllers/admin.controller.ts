import { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import logger from '../utils/logger';
import { env } from '../config/environment';

/**
 * GET /api/admin/dashboard/stats
 * Returns dashboard statistics and time-series chart data.
 */
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  const days = parseInt(req.query.days as string, 10) || 30;
  const stats = await adminService.getDashboardStats(days);
  sendSuccess(res, stats);
}

/**
 * GET /api/admin/resources
 * Admin listing — returns ALL statuses (draft, published, archived). The public
 * /api/resources listing intersects with a PUBLIC_STATUSES allow-list which
 * filters drafts out; admins managing content need the unfiltered view.
 */
export async function listResourcesAdmin(req: Request, res: Response): Promise<void> {
  const {
    page,
    limit,
    sort,
    order,
    status,
    category,
    region,
    search,
    startDate,
    endDate,
  } = req.query as Record<string, any>;

  const filters: Record<string, any> = {};
  if (status) {
    filters.status = (status as string).split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (category) {
    filters.category = (category as string).split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (region) filters.region = region as string;
  if (search) filters.search = search as string;
  if (startDate) filters.startDate = startDate as string;
  if (endDate) filters.endDate = endDate as string;

  const options = {
    sort: (sort as string) || 'updated_at',
    order: (order as 'asc' | 'desc') || 'desc',
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  };

  const result = await adminService.listResourcesAdmin(filters as any, options);
  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/admin/resources/:id
 * Admin single-resource read — returns any status (draft / published / archived).
 */
export async function getResourceAdmin(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const resource = await adminService.getResourceAdmin(id);
  sendSuccess(res, resource);
}

/**
 * POST /api/admin/resources
 * Creates a new resource item.
 */
export async function createResource(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const resource = await adminService.createResource(req.body, userId, ipAddress);
  sendSuccess(res, resource, 201);
}

/**
 * PUT /api/admin/resources/:id
 * Updates an existing resource item.
 */
export async function updateResource(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const resource = await adminService.updateResource(id, req.body, userId, ipAddress);
  sendSuccess(res, resource);
}

/**
 * POST /api/admin/resources/:id/clone
 * Clones an existing resource. Title gets " (DRAFT)", status -> draft, new UUID.
 * Audit row INSERT with metadata { clone_of }.
 */
export async function cloneResource(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const clone = await adminService.cloneResource(id, userId, ipAddress);
  sendSuccess(res, clone, 201);
}

/**
 * DELETE /api/admin/resources/:id
 * Soft-deletes a resource_item (is_deleted = true). Audit row recorded.
 */
export async function deleteResource(req: Request, res: Response): Promise<void> {
  const actorId = req.user!.id;
  const ip = (req.ip as string) || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const id = req.params.id as string;
  await adminService.softDeleteResource(id, actorId, ip, ua);
  res.status(204).end();
}

/**
 * POST /api/admin/resources/:id/updates
 * Adds an update entry to a resource.
 */
export async function addResourceUpdate(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const resourceId = req.params.id as string;
  const update = await adminService.addResourceUpdate(resourceId, req.body, userId, ipAddress);
  sendSuccess(res, update, 201);
}

/**
 * POST /api/admin/service-locations
 * Creates a new service location.
 */
export async function createServiceLocation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const location = await adminService.createServiceLocation(req.body, userId, ipAddress);
  sendSuccess(res, location, 201);
}

/**
 * PUT /api/admin/service-locations/:id
 * Updates an existing service location.
 */
export async function updateServiceLocation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const location = await adminService.updateServiceLocation(id, req.body, userId, ipAddress);
  sendSuccess(res, location);
}

/**
 * DELETE /api/admin/service-locations/:id
 * Soft-deletes a service_location. Audit row recorded.
 */
export async function deleteServiceLocation(req: Request, res: Response): Promise<void> {
  const actorId = req.user!.id;
  const ip = (req.ip as string) || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const id = req.params.id as string;
  await adminService.softDeleteServiceLocation(id, actorId, ip, ua);
  res.status(204).end();
}

/**
 * GET /api/admin/forms
 * Lists all form definitions (including unpublished).
 */
export async function listForms(_req: Request, res: Response): Promise<void> {
  const forms = await adminService.listAllForms();
  sendSuccess(res, forms);
}

/**
 * POST /api/admin/forms
 * Creates a new form definition.
 */
export async function createForm(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const form = await adminService.createForm(req.body, userId, ipAddress);
  sendSuccess(res, form, 201);
}

/**
 * PUT /api/admin/forms/:id
 * Updates an existing form definition.
 */
export async function updateForm(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const form = await adminService.updateForm(id, req.body, userId, ipAddress);
  sendSuccess(res, form);
}

/**
 * POST /api/admin/forms/:id/clone
 * Clones a form_definition. form_name gets " (DRAFT)", is_published -> false.
 */
export async function cloneForm(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const clone = await adminService.cloneForm(id, userId, ipAddress);
  sendSuccess(res, clone, 201);
}

/**
 * DELETE /api/admin/forms/:id
 * Soft-deletes a form_definition AND unpublishes it. Audit row recorded.
 */
export async function deleteForm(req: Request, res: Response): Promise<void> {
  const actorId = req.user!.id;
  const ip = (req.ip as string) || null;
  const ua = (req.headers['user-agent'] as string) || null;
  const id = req.params.id as string;
  await adminService.softDeleteForm(id, actorId, ip, ua);
  res.status(204).end();
}

/**
 * GET /api/admin/services
 * Lists all services including unpublished.
 */
export async function listServices(_req: Request, res: Response): Promise<void> {
  const services = await adminService.listAllServices();
  sendSuccess(res, services);
}

/**
 * GET /api/admin/service-categories
 * Lists all service categories.
 */
export async function listServiceCategories(_req: Request, res: Response): Promise<void> {
  const categories = await adminService.listServiceCategories();
  sendSuccess(res, categories);
}

/**
 * POST /api/admin/services
 * Creates a new service catalogue entry.
 */
export async function createService(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const service = await adminService.createServiceCatalogue(req.body, userId, ipAddress);
  sendSuccess(res, service, 201);
}

/**
 * PUT /api/admin/services/:id
 * Updates an existing service catalogue entry.
 */
export async function updateService(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const service = await adminService.updateServiceCatalogue(id, req.body, userId, ipAddress);
  sendSuccess(res, service);
}

/**
 * POST /api/admin/services/:id/clone
 * Clones a service catalogue entry. Title gets " (DRAFT)", is_published -> false.
 */
export async function cloneService(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const clone = await adminService.cloneServiceCatalogue(id, userId, ipAddress);
  sendSuccess(res, clone, 201);
}

/**
 * GET /api/admin/notifications
 * Lists all broadcast notification messages.
 */
export async function listBroadcasts(_req: Request, res: Response): Promise<void> {
  const broadcasts = await adminService.listAllBroadcasts();
  sendSuccess(res, broadcasts);
}

/**
 * GET /api/admin/submissions
 * Lists all submissions with filters and pagination.
 */
export async function listAllSubmissions(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;
  const filters = {
    formId: req.query.formId as string | undefined,
    status: req.query.status as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
  };

  const result = await adminService.listAllSubmissions(filters, page, limit);
  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/admin/submissions/:id
 * Returns the full submission detail for admin review: the submission row
 * (with form_name), the parent form definition (including form_schema for
 * label rendering), and the file_attachment metadata. No file bytes are
 * included — clients download via GET /api/v1/files/:id.
 */
export async function getSubmissionDetail(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const detail = await adminService.getSubmissionDetail(id);
  sendSuccess(res, detail);
}

/**
 * PUT /api/admin/submissions/:id/status
 * Updates a submission's status.
 */
export async function updateSubmissionStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const id = req.params.id as string;
  const submission = await adminService.updateSubmissionStatus(
    id,
    req.body.status,
    userId,
    ipAddress
  );
  sendSuccess(res, submission);
}

/**
 * POST /api/admin/notifications/broadcast
 * Broadcasts a notification to subscribers.
 *
 * Diagnostic logging: when NODE_ENV !== 'production' we emit a single-line
 * `broadcast_controller_post_parse` log after Zod has stripped the body so
 * any future 422 surfaces the actual post-parse keys + types. The validator
 * middleware already logs validation_failure on Zod rejection; this log
 * captures the success path so we can correlate "the body parsed cleanly,
 * so this 422 isn't ours" vs "body never reached the controller".
 */
export async function broadcastNotification(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const ipAddress = (req.ip as string) || null;

  if (env.NODE_ENV !== 'production') {
    const body = (req.body || {}) as Record<string, unknown>;
    logger.info('broadcast_controller_post_parse', {
      titleLen: typeof body.title === 'string' ? body.title.length : null,
      bodyLen: typeof body.body === 'string' ? body.body.length : null,
      type: body.type,
      regionFilter: body.regionFilter,
      keys: Object.keys(body),
    });
  }

  const result = await adminService.broadcastNotification(
    req.body.title,
    req.body.body,
    req.body.type,
    req.body.regionFilter || null,
    userId,
    ipAddress
  );
  sendSuccess(res, result, 201);
}

/**
 * GET /api/admin/users
 * Paginated user list with optional role and search filters.
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const role = (req.query.role as string) || undefined;
  const search = (req.query.search as string) || undefined;

  const { items, total } = await adminService.listUsers({ page, limit, role, search });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  sendPaginated(res, items, { page, limit, total, totalPages });
}

/**
 * PUT /api/admin/users/:id/role
 * Change a user's role.
 */
export async function updateUserRole(req: Request, res: Response): Promise<void> {
  const actorUserId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const userAgent = (req.headers['user-agent'] as string) || null;
  const targetId = req.params.id as string;
  const updated = await adminService.updateUserRole(
    targetId,
    req.body.role,
    actorUserId,
    ipAddress,
    userAgent
  );
  sendSuccess(res, updated);
}

/**
 * PUT /api/admin/users/:id/status
 * Toggle a user's is_active flag.
 */
export async function updateUserStatus(req: Request, res: Response): Promise<void> {
  const actorUserId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const userAgent = (req.headers['user-agent'] as string) || null;
  const targetId = req.params.id as string;
  const updated = await adminService.updateUserStatus(
    targetId,
    req.body.isActive,
    actorUserId,
    ipAddress,
    userAgent
  );
  sendSuccess(res, updated);
}

/**
 * DELETE /api/admin/users/:id
 * Soft-delete a user. Self-deletion is blocked.
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const actorUserId = req.user!.id;
  const ipAddress = (req.ip as string) || null;
  const userAgent = (req.headers['user-agent'] as string) || null;
  const targetId = req.params.id as string;
  await adminService.softDeleteUser(targetId, actorUserId, ipAddress, userAgent);
  res.status(204).end();
}
