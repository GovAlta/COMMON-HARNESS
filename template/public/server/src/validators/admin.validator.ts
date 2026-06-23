import { z } from 'zod';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Resource Schemas ──────────────────────────────────────

export const createResourceSchema = {
  body: z.object({
    resource_title: z.string().min(1).max(255),
    resource_status: z.enum(['published', 'draft', 'archived']).default('draft'),
    resource_category: z.enum(['guide', 'announcement', 'policy', 'reference', 'bulletin']),
    resource_summary: z.string().max(500).optional(),
    resource_content: z.string().max(50000).optional(),
    resource_author: z.string().max(255).optional(),
    resource_region: z.string().max(100).optional(),
    resource_published_at: z.string().optional(),
    resource_tags: z.array(z.string()).optional(),
  }),
};

export const updateResourceSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
  body: z.object({
    resource_title: z.string().min(1).max(255).optional(),
    resource_status: z.enum(['published', 'draft', 'archived']).optional(),
    resource_category: z.enum(['guide', 'announcement', 'policy', 'reference', 'bulletin']).optional(),
    resource_summary: z.string().max(500).optional(),
    resource_content: z.string().max(50000).optional(),
    resource_author: z.string().max(255).optional(),
    resource_region: z.string().max(100).optional(),
    resource_published_at: z.string().optional(),
    resource_tags: z.array(z.string()).optional(),
  }),
};

export const createResourceUpdateSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
  body: z.object({
    update_title: z.string().min(1).max(255),
    update_description: z.string().max(5000).optional(),
    update_type: z.enum(['revision', 'correction', 'supplement', 'status_change']),
  }),
};

// ─── Service Location Schemas ──────────────────────────────

export const createServiceLocationSchema = {
  body: z.object({
    location_name: z.string().min(1).max(255),
    location_address: z.string().max(500).optional(),
    location_city: z.string().max(100).optional(),
    location_region: z.string().max(100).optional(),
    location_latitude: z.number().min(-90).max(90).optional(),
    location_longitude: z.number().min(-180).max(180).optional(),
    location_phone: z.string().max(50).optional(),
    location_email: z.string().email().max(255).optional(),
    location_hours: z.string().max(500).optional(),
    location_services_offered: z.string().max(5000).optional(),
    location_accessibility_info: z.string().max(500).optional(),
    location_status: z.enum(['open', 'closed', 'limited']).default('open'),
    fk_service_location_service_category: z.string().regex(uuidRegex).optional(),
  }),
};

export const updateServiceLocationSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
  body: z.object({
    location_name: z.string().min(1).max(255).optional(),
    location_address: z.string().max(500).optional(),
    location_city: z.string().max(100).optional(),
    location_region: z.string().max(100).optional(),
    location_latitude: z.number().min(-90).max(90).optional(),
    location_longitude: z.number().min(-180).max(180).optional(),
    location_phone: z.string().max(50).optional(),
    location_email: z.string().email().max(255).optional(),
    location_hours: z.string().max(500).optional(),
    location_services_offered: z.string().max(5000).optional(),
    location_accessibility_info: z.string().max(500).optional(),
    location_status: z.enum(['open', 'closed', 'limited']).optional(),
    fk_service_location_service_category: z.string().regex(uuidRegex).optional(),
  }),
};

// ─── Form Schemas ──────────────────────────────────────────

export const createFormSchema = {
  body: z.object({
    form_name: z.string().min(1).max(200),
    form_description: z.string().max(2000).optional(),
    form_schema: z.object({
      title: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        label: z.string(),
      }).passthrough()),
    }).passthrough(),
    is_published: z.boolean().optional(),
  }),
};

export const updateFormSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
  body: z.object({
    form_name: z.string().min(1).max(200).optional(),
    form_description: z.string().max(2000).optional(),
    form_schema: z.object({
      title: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        label: z.string(),
      }).passthrough()),
    }).passthrough().optional(),
    is_published: z.boolean().optional(),
    form_version_number: z.number().int().min(1).optional(),
  }),
};

// ─── Service Catalogue Schemas ─────────────────────────────

export const createServiceCatalogueSchema = {
  body: z.object({
    service_title: z.string().trim().min(1).max(255),
    service_description_brief: z.string().trim().min(1).max(255),
    service_description_full: z.string().trim().min(1),
    fk_service_catalogue_service_category: z.string().uuid(),
    service_eligibility: z.string().trim().nullable().optional(),
    service_how_to_apply: z.string().trim().nullable().optional(),
    service_required_documents: z.string().trim().nullable().optional(),
    service_contact_phone: z.string().trim().max(20).nullable().optional(),
    service_contact_email: z.string().trim().email().max(255).nullable().optional(),
    is_published: z.boolean().optional().default(true),
  }),
};

export const updateServiceCatalogueSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    service_title: z.string().trim().min(1).max(255).optional(),
    service_description_brief: z.string().trim().min(1).max(255).optional(),
    service_description_full: z.string().trim().min(1).optional(),
    fk_service_catalogue_service_category: z.string().uuid().optional(),
    service_eligibility: z.string().trim().nullable().optional(),
    service_how_to_apply: z.string().trim().nullable().optional(),
    service_required_documents: z.string().trim().nullable().optional(),
    service_contact_phone: z.string().trim().max(20).nullable().optional(),
    service_contact_email: z.string().trim().email().max(255).nullable().optional(),
    is_published: z.boolean().optional(),
  }),
};

// ─── Submission Schemas ────────────────────────────────────

export const adminSubmissionsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    formId: z.string().regex(uuidRegex).optional(),
    status: z.enum(['submitted', 'in-review', 'approved', 'rejected', 'completed']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
};

export const updateSubmissionStatusSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
  body: z.object({
    status: z.enum(['submitted', 'in-review', 'approved', 'rejected', 'completed']),
  }),
};

// ─── Broadcast Schema ──────────────────────────────────────

export const broadcastNotificationSchema = {
  body: z.object({
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(5000),
    type: z.enum(['service_update', 'announcement', 'emergency_broadcast', 'general']),
    regionFilter: z.string().max(200).nullable().optional(),
  }),
};

// ─── Dashboard Schema ──────────────────────────────────────

export const dashboardStatsQuerySchema = {
  query: z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  }),
};

// ─── User Management Schemas ───────────────────────────────

// Role names mirror server/src/middleware/authorize.ts ROLE_HIERARCHY and the
// CHECK constraint in migrations/019_expand_role_check.sql.
const ROLE_NAMES = z.enum(['viewer', 'submitter', 'editor', 'manager', 'admin', 'super_admin']);

export const listUsersQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: ROLE_NAMES.optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
};

export const updateUserRoleSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid user id'),
  }),
  body: z.object({
    role: ROLE_NAMES,
  }),
};

export const updateUserStatusSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid user id'),
  }),
  body: z.object({
    isActive: z.boolean(),
  }),
};

// Reusable UUID-only params schema for DELETE endpoints (users + resources +
// service-locations + forms). The body is empty by contract.
export const adminUuidParamSchema = {
  params: z.object({
    id: z.string().regex(uuidRegex, 'Invalid UUID format'),
  }),
};
