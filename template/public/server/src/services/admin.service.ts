import * as adminModel from '../models/admin.model';
import * as auditModel from '../models/audit.model';
import * as userModel from '../models/user.model';
import * as fileModel from '../models/file.model';
import * as resourceModel from '../models/resource.model';
import * as notificationService from './notification.service';
import { ROLE_HIERARCHY } from '../middleware/authorize';
import { logAuditEvent } from '../utils/audit-logger';
import { AppError } from '../utils/app-error';
import type { ResourceItemRecord, ResourceUpdateRecord, ServiceLocationRecord, ResourceFilters, PaginationOptions } from '../types/resource';
import type {
  FormDefinitionRecord,
  FormSubmissionRecord,
  FormSubmissionWithForm,
  FileAttachmentRecord,
  SubmissionStatus,
} from '../types/form';
import type { UserRecord } from '../types/auth';

// ─── Dashboard Stats ───────────────────────────────────────

export interface DashboardStats {
  totalResourceCount: number;
  publishedResourceCount: number;
  serviceLocationCount: number;
  openAssistanceRequests: number;
  pendingSubmissions: number;
  resourcesOverTime: adminModel.TimeSeriesPoint[];
  submissionsOverTime: adminModel.TimeSeriesPoint[];
  recentSubmissions: FormSubmissionWithForm[];
}

export async function getDashboardStats(days: number = 30): Promise<DashboardStats> {
  const [
    totalResourceCount,
    publishedResourceCount,
    serviceLocationCount,
    openAssistanceRequests,
    pendingSubmissions,
    resourcesOverTime,
    submissionsOverTime,
    recentSubmissions,
  ] = await Promise.all([
    adminModel.getResourceCount(),
    adminModel.getPublishedResourceCount(),
    adminModel.getServiceLocationCount(),
    adminModel.getOpenAssistanceCount(),
    adminModel.getPendingSubmissionCount(),
    adminModel.getResourcesOverTime(days),
    adminModel.getSubmissionsOverTime(days),
    adminModel.getRecentSubmissions(5),
  ]);

  return {
    totalResourceCount,
    publishedResourceCount,
    serviceLocationCount,
    openAssistanceRequests,
    pendingSubmissions,
    resourcesOverTime,
    submissionsOverTime,
    recentSubmissions,
  };
}

// ─── Resource Management ───────────────────────────────────

export async function createResource(
  data: adminModel.CreateResourceData,
  userId: string,
  ipAddress: string | null
): Promise<ResourceItemRecord> {
  data.created_by = userId;
  const resource = await adminModel.createResource(data);

  // Audit log
  await auditModel.createAuditEntry(
    'resource_item',
    resource.pk_resource_item,
    'INSERT',
    null,
    resource as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return resource;
}

// ─── Admin resource read (drafts + archived visible) ──────────
//
// The public listResources controller intersects with a PUBLIC_STATUSES
// allow-list (status=published only), and resourceModel.findById filters
// resource_status='published' as defense-in-depth. Admin views need to see
// drafts and archived items to manage them, so they go through these
// admin-only paths that hit the model directly without the filter.

export async function listResourcesAdmin(
  filters: ResourceFilters,
  options: PaginationOptions
): Promise<{
  data: ResourceItemRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const [data, total] = await Promise.all([
    resourceModel.findAll(filters, options),
    resourceModel.countAll(filters),
  ]);
  const totalPages = Math.ceil(total / options.limit) || 1;
  return {
    data,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
    },
  };
}

export async function getResourceAdmin(id: string): Promise<ResourceItemRecord> {
  const resource = await adminModel.findResourceById(id);
  if (!resource) {
    throw AppError.notFound('Resource not found');
  }
  return resource;
}

export async function updateResource(
  id: string,
  data: adminModel.UpdateResourceData,
  userId: string,
  ipAddress: string | null
): Promise<ResourceItemRecord> {
  const existing = await adminModel.findResourceById(id);
  if (!existing) {
    throw AppError.notFound('Resource not found');
  }

  data.updated_by = userId;

  const updated = await adminModel.updateResource(id, data);
  if (!updated) {
    throw AppError.notFound('Resource not found');
  }

  // Audit log
  await auditModel.createAuditEntry(
    'resource_item',
    id,
    'UPDATE',
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return updated;
}

export async function softDeleteResource(
  id: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const existing = await adminModel.findResourceById(id);
  if (!existing) {
    throw AppError.notFound('Resource not found');
  }

  const ok = await adminModel.softDeleteResource(id, actorUserId);
  if (!ok) {
    // Race: someone else flipped is_deleted between findById and the update.
    throw AppError.notFound('Resource not found');
  }

  await logAuditEvent({
    action: 'DELETE',
    tableName: 'resource_item',
    recordId: id,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: {
      resource_title: existing.resource_title,
      resource_status: existing.resource_status,
    },
    metadata: { soft_delete: true },
  });
}

export async function addResourceUpdate(
  resourceId: string,
  data: adminModel.CreateResourceUpdateData,
  userId: string,
  ipAddress: string | null
): Promise<ResourceUpdateRecord> {
  // Verify resource exists
  const resource = await adminModel.findResourceById(resourceId);
  if (!resource) {
    throw AppError.notFound('Resource not found');
  }

  data.created_by = userId;
  const update = await adminModel.createResourceUpdate(resourceId, data);

  // Audit log
  await auditModel.createAuditEntry(
    'resource_update',
    update.pk_resource_update,
    'INSERT',
    null,
    update as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return update;
}

// ─── Service Location Management ───────────────────────────

export async function createServiceLocation(
  data: adminModel.CreateServiceLocationData,
  userId: string,
  ipAddress: string | null
): Promise<ServiceLocationRecord> {
  data.created_by = userId;
  const location = await adminModel.createServiceLocation(data);

  // Audit log
  await auditModel.createAuditEntry(
    'service_location',
    location.pk_service_location,
    'INSERT',
    null,
    location as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return location;
}

export async function updateServiceLocation(
  id: string,
  data: adminModel.UpdateServiceLocationData,
  userId: string,
  ipAddress: string | null
): Promise<ServiceLocationRecord> {
  const existing = await adminModel.findServiceLocationById(id);
  if (!existing) {
    throw AppError.notFound('Service location not found');
  }

  data.updated_by = userId;

  const updated = await adminModel.updateServiceLocation(id, data);
  if (!updated) {
    throw AppError.notFound('Service location not found');
  }

  // Audit log
  await auditModel.createAuditEntry(
    'service_location',
    id,
    'UPDATE',
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return updated;
}

export async function softDeleteServiceLocation(
  id: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const existing = await adminModel.findServiceLocationById(id);
  if (!existing) {
    throw AppError.notFound('Service location not found');
  }

  const ok = await adminModel.softDeleteServiceLocation(id, actorUserId);
  if (!ok) {
    throw AppError.notFound('Service location not found');
  }

  await logAuditEvent({
    action: 'DELETE',
    tableName: 'service_location',
    recordId: id,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: {
      location_name: existing.location_name,
      location_status: existing.location_status,
    },
    metadata: { soft_delete: true },
  });
}

// ─── Form Management ───────────────────────────────────────

export async function listAllForms(): Promise<FormDefinitionRecord[]> {
  return adminModel.findAllForms();
}

// ─── Service Catalogue Management ─────────────────────────

export async function listAllServices(): Promise<any[]> {
  return adminModel.findAllServices();
}

export async function listServiceCategories(): Promise<any[]> {
  return adminModel.findAllServiceCategories();
}

export async function createServiceCatalogue(
  data: adminModel.CreateServiceCatalogueData,
  userId: string,
  ipAddress: string | null
): Promise<any> {
  data.created_by = userId;
  const service = await adminModel.createServiceCatalogue(data);

  await auditModel.createAuditEntry(
    'service_catalogue',
    service.pk_service_catalogue,
    'INSERT',
    null,
    { title: data.service_title, category: data.fk_service_catalogue_service_category },
    userId,
    ipAddress
  );

  return service;
}

export async function updateServiceCatalogue(
  id: string,
  data: adminModel.UpdateServiceCatalogueData,
  userId: string,
  ipAddress: string | null
): Promise<any> {
  const existing = await adminModel.findServiceById(id);
  if (!existing) {
    throw AppError.notFound('Service not found');
  }

  const updated = await adminModel.updateServiceCatalogue(id, data);
  if (!updated) {
    throw AppError.notFound('Service not found');
  }

  await auditModel.createAuditEntry(
    'service_catalogue',
    id,
    'UPDATE',
    { title: existing.service_title },
    data as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return updated;
}

export async function listAllBroadcasts(): Promise<any[]> {
  return adminModel.findAllBroadcasts();
}

export async function createForm(
  data: adminModel.CreateFormDefinitionData,
  userId: string,
  ipAddress: string | null
): Promise<FormDefinitionRecord> {
  data.created_by = userId;
  const form = await adminModel.createFormDefinition(data);

  // Audit log
  await auditModel.createAuditEntry(
    'form_definition',
    form.pk_form_definition,
    'INSERT',
    null,
    form as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return form;
}

export async function updateForm(
  id: string,
  data: adminModel.UpdateFormDefinitionData,
  userId: string,
  ipAddress: string | null
): Promise<FormDefinitionRecord> {
  const existing = await adminModel.findFormById(id);
  if (!existing) {
    throw AppError.notFound('Form definition not found');
  }

  data.updated_by = userId;
  const updated = await adminModel.updateFormDefinition(id, data);
  if (!updated) {
    throw AppError.notFound('Form definition not found');
  }

  // Audit log
  await auditModel.createAuditEntry(
    'form_definition',
    id,
    'UPDATE',
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    userId,
    ipAddress
  );

  return updated;
}

export async function softDeleteForm(
  id: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const existing = await adminModel.findFormById(id);
  if (!existing) {
    throw AppError.notFound('Form definition not found');
  }

  const ok = await adminModel.softDeleteFormDefinition(id, actorUserId);
  if (!ok) {
    throw AppError.notFound('Form definition not found');
  }

  await logAuditEvent({
    action: 'DELETE',
    tableName: 'form_definition',
    recordId: id,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: {
      form_name: existing.form_name,
      is_published: existing.is_published,
    },
    metadata: { soft_delete: true },
  });
}

// ─── Submission Processing ─────────────────────────────────

/**
 * Valid status transitions:
 *   submitted -> in-review
 *   in-review -> approved | rejected
 *   approved -> completed
 *   rejected -> in-review (allow re-review)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  submitted: ['in-review'],
  'in-review': ['approved', 'rejected'],
  approved: ['completed'],
  rejected: ['in-review'],
};

export async function listAllSubmissions(
  filters: adminModel.AdminSubmissionFilters,
  page: number,
  limit: number
): Promise<{
  data: FormSubmissionWithForm[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const [data, total] = await Promise.all([
    adminModel.findAllSubmissions(filters, page, limit),
    adminModel.countAllSubmissions(filters),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Admin: load full submission detail.
 * Returns the full submission record (no ownership filter — admin can view any
 * user's submission), the parent form_definition for rendering field labels,
 * and the file_attachment metadata (no bytes — clients download via
 * GET /api/v1/files/:id which performs its own auth check).
 *
 * Throws 404 if the submission does not exist.
 */
export async function getSubmissionDetail(id: string): Promise<{
  submission: FormSubmissionWithForm;
  form: FormDefinitionRecord;
  attachments: FileAttachmentRecord[];
}> {
  const submission = await adminModel.findSubmissionByIdWithForm(id);
  if (!submission) {
    throw AppError.notFound('Submission not found');
  }

  const form = await adminModel.findFormById(
    submission.fk_form_submission_form_definition
  );
  if (!form) {
    // Defensive: a submission row with a missing form_definition would be a
    // schema integrity violation, but surface a clear error if it ever happens.
    throw AppError.notFound('Form definition not found');
  }

  const attachments = await fileModel.findBySubmission(submission.pk_form_submission);

  return { submission, form, attachments };
}

export async function updateSubmissionStatus(
  id: string,
  newStatus: SubmissionStatus,
  userId: string,
  ipAddress: string | null
): Promise<FormSubmissionRecord> {
  const existing = await adminModel.findSubmissionById(id);
  if (!existing) {
    throw AppError.notFound('Submission not found');
  }

  // Validate status transition
  const currentStatus = existing.submission_status;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new AppError(
      `Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      422,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await adminModel.updateSubmissionStatus(id, newStatus, userId);
  if (!updated) {
    throw AppError.notFound('Submission not found');
  }

  // Audit log
  await auditModel.createAuditEntry(
    'form_submission',
    id,
    'UPDATE',
    { submission_status: currentStatus },
    { submission_status: newStatus },
    userId,
    ipAddress
  );

  return updated;
}

// ─── Clone (Resources / Services / Forms) ─────────────────
//
// Cloning makes a new row from an existing one with a few overrides:
//   - new pk_* UUID (handled by DB DEFAULT gen_random_uuid())
//   - title field gets " (DRAFT)" appended
//   - published flag flipped to false / status set to draft
//   - created_by / updated_by = the cloning admin
//   - audit row INSERT with metadata { clone_of: <originalId> }
// All other columns copy as-is. The pattern is the same across entity types
// — three small functions are clearer than one parameterised one.

export async function cloneResource(
  originalId: string,
  actorUserId: string,
  ipAddress: string | null
): Promise<ResourceItemRecord> {
  const original = await adminModel.findResourceById(originalId);
  if (!original) {
    throw AppError.notFound('Resource not found');
  }

  // resource_tags arrives from the DB as either a JS array (if it's a jsonb
  // column that pg has unwrapped) or as a raw JSON string. The create path
  // re-stringifies, so we just pass whatever shape we got — but if it's null
  // we pass [] so the create INSERT is well-formed.
  const tagsField = (original as unknown as { resource_tags: unknown[] | null }).resource_tags;
  const clone = await adminModel.createResource({
    resource_title: `${original.resource_title} (DRAFT)`,
    resource_status: 'draft',
    resource_category: original.resource_category,
    resource_summary: original.resource_summary || undefined,
    resource_content: original.resource_content || undefined,
    resource_author: original.resource_author || undefined,
    resource_region: original.resource_region || undefined,
    resource_published_at: undefined,
    resource_tags: Array.isArray(tagsField) ? tagsField : [],
    created_by: actorUserId,
  });

  await auditModel.createAuditEntry(
    'resource_item',
    clone.pk_resource_item,
    'INSERT',
    null,
    { clone_of: originalId, resource_title: clone.resource_title } as Record<string, unknown>,
    actorUserId,
    ipAddress
  );

  return clone;
}

export async function cloneServiceCatalogue(
  originalId: string,
  actorUserId: string,
  ipAddress: string | null
): Promise<unknown> {
  const original = await adminModel.findServiceById(originalId);
  if (!original) {
    throw AppError.notFound('Service not found');
  }

  const clone = await adminModel.createServiceCatalogue({
    service_title: `${original.service_title} (DRAFT)`,
    service_description_brief: original.service_description_brief,
    service_description_full: original.service_description_full,
    fk_service_catalogue_service_category: original.fk_service_catalogue_service_category,
    service_eligibility: original.service_eligibility,
    service_how_to_apply: original.service_how_to_apply,
    service_required_documents: original.service_required_documents,
    service_contact_phone: original.service_contact_phone,
    service_contact_email: original.service_contact_email,
    is_published: false,
    created_by: actorUserId,
  });

  await auditModel.createAuditEntry(
    'service_catalogue',
    clone.pk_service_catalogue,
    'INSERT',
    null,
    { clone_of: originalId, service_title: clone.service_title } as Record<string, unknown>,
    actorUserId,
    ipAddress
  );

  return clone;
}

export async function cloneForm(
  originalId: string,
  actorUserId: string,
  ipAddress: string | null
): Promise<FormDefinitionRecord> {
  const original = await adminModel.findFormById(originalId);
  if (!original) {
    throw AppError.notFound('Form not found');
  }

  const clone = await adminModel.createFormDefinition({
    form_name: `${original.form_name} (DRAFT)`,
    form_description: original.form_description || undefined,
    form_schema: original.form_schema as unknown as Record<string, unknown>,
    is_published: false,
    created_by: actorUserId,
  });

  await auditModel.createAuditEntry(
    'form_definition',
    clone.pk_form_definition,
    'INSERT',
    null,
    { clone_of: originalId, form_name: clone.form_name } as Record<string, unknown>,
    actorUserId,
    ipAddress
  );

  return clone;
}

// ─── Broadcast ─────────────────────────────────────────────

export async function broadcastNotification(
  title: string,
  body: string,
  type: string,
  regionFilter: string | null,
  userId: string,
  ipAddress: string | null
): Promise<{ messageId: string; deliveryCount: number }> {
  const result = await notificationService.broadcast(
    title,
    body,
    type as any,
    regionFilter,
    null,
    userId
  );

  // Audit log
  await auditModel.createAuditEntry(
    'notification_message',
    result.messageId,
    'INSERT',
    null,
    { title, body, type, regionFilter, deliveryCount: result.deliveryCount },
    userId,
    ipAddress
  );

  return result;
}

// ─── User Management ───────────────────────────────────────

export async function listUsers(opts: {
  page: number;
  limit: number;
  role?: string;
  search?: string;
}): Promise<{ items: UserRecord[]; total: number }> {
  return userModel.listUsers(opts);
}

/**
 * Admin: change a user's role. Validates that:
 *   1. The target user exists.
 *   2. The new role is in the canonical ROLE_HIERARCHY.
 *   3. The actor is not demoting themselves (foot-gun guard — the actor would
 *      lose admin access mid-session). Promotions/demotions of *other* users
 *      are unrestricted; full segregation-of-duty rules belong in a separate
 *      approval workflow if your org requires it.
 *
 * Writes an audit_log row with before/after role so changes are reviewable.
 */
export async function updateUserRole(
  targetUserId: string,
  newRole: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<UserRecord> {
  if (!ROLE_HIERARCHY.includes(newRole)) {
    throw AppError.validation([{
      field: 'role',
      message: `Invalid role "${newRole}". Allowed: ${ROLE_HIERARCHY.join(', ')}`,
    }]);
  }
  if (targetUserId === actorUserId) {
    throw AppError.validation([{
      field: 'role',
      message: 'You cannot change your own role.',
    }]);
  }

  const target = await userModel.findById(targetUserId);
  if (!target) {
    throw AppError.notFound('User not found');
  }
  if (target.user_role_name === newRole) {
    return target;
  }

  const updated = await userModel.updateRole(targetUserId, newRole);
  if (!updated) {
    // Race: user was soft-deleted between findById and updateRole.
    throw AppError.notFound('User not found');
  }

  await logAuditEvent({
    action: 'UPDATE',
    tableName: 'user_account',
    recordId: targetUserId,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: { user_role_name: target.user_role_name },
    newData: { user_role_name: newRole },
    metadata: { change_type: 'role_update' },
  });

  return updated;
}

/**
 * Admin: toggle a user's is_active flag.
 *
 * Self-toggle is blocked with a 400 (mirrors the self-role-change guard) — an
 * admin disabling themselves would lose access mid-session and would need a
 * peer admin to recover. The validator already constrains body shape; this
 * just enforces the business rule.
 */
export async function updateUserStatus(
  targetUserId: string,
  isActive: boolean,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<UserRecord> {
  if (targetUserId === actorUserId) {
    throw AppError.badRequest('You cannot change your own active status.');
  }

  const target = await userModel.findById(targetUserId);
  if (!target) {
    throw AppError.notFound('User not found');
  }
  if (target.is_active === isActive) {
    // No-op — already in the requested state. Return the existing row so the
    // controller can respond 200 without an audit row for a non-change.
    return target;
  }

  const updated = await userModel.updateActiveStatus(targetUserId, isActive);
  if (!updated) {
    throw AppError.notFound('User not found');
  }

  await logAuditEvent({
    action: 'UPDATE',
    tableName: 'user_account',
    recordId: targetUserId,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: { is_active: target.is_active },
    newData: { is_active: isActive },
    metadata: { change_type: 'status_update' },
  });

  return updated;
}

/**
 * Admin: soft-delete a user account.
 *
 * Sets is_deleted = true AND is_active = false in the same statement (see
 * userModel.softDelete) so the row is filtered from every list/read query
 * (all of which already include `is_deleted = false`) AND cannot
 * reauthenticate via SSO. Self-deletion is blocked with a 400.
 */
export async function softDeleteUser(
  targetUserId: string,
  actorUserId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  if (targetUserId === actorUserId) {
    throw AppError.badRequest('You cannot delete your own account.');
  }

  const target = await userModel.findById(targetUserId);
  if (!target) {
    throw AppError.notFound('User not found');
  }

  const ok = await userModel.softDelete(targetUserId);
  if (!ok) {
    throw AppError.notFound('User not found');
  }

  await logAuditEvent({
    action: 'DELETE',
    tableName: 'user_account',
    recordId: targetUserId,
    userId: actorUserId,
    ipAddress,
    userAgent,
    oldData: {
      user_email_address: target.user_email_address,
      user_display_name: target.user_display_name,
      user_role_name: target.user_role_name,
    },
    metadata: { soft_delete: true },
  });
}
