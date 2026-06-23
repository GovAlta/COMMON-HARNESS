import { pool } from '../config/database';
import type { ResourceItemRecord, ResourceUpdateRecord, ServiceLocationRecord } from '../types/resource';
import type { FormDefinitionRecord, FormSubmissionRecord, FormSubmissionWithForm } from '../types/form';

// ─── Dashboard Stats ───────────────────────────────────────

export async function getResourceCount(status?: string): Promise<number> {
  if (status) {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM resource_item WHERE resource_status = $1 AND is_deleted = false',
      [status]
    );
    return parseInt(result.rows[0].count, 10);
  }
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM resource_item WHERE is_deleted = false'
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getPublishedResourceCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM resource_item
     WHERE resource_status = 'published' AND is_deleted = false`
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getServiceLocationCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM service_location WHERE is_deleted = false'
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getOpenAssistanceCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM form_submission
     WHERE submission_status IN ('submitted', 'in-review')`
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getPendingSubmissionCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM form_submission
     WHERE submission_status = 'submitted'`
  );
  return parseInt(result.rows[0].count, 10);
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export async function getResourcesOverTime(days: number): Promise<TimeSeriesPoint[]> {
  const result = await pool.query<{ date: string; value: string }>(
    `SELECT
       d::date::text as date,
       COUNT(ri.pk_resource_item)::int as value
     FROM generate_series(
       CURRENT_DATE - $1::int * INTERVAL '1 day',
       CURRENT_DATE,
       '1 day'
     ) AS d
     LEFT JOIN resource_item ri
       ON ri.created_at::date = d::date AND ri.is_deleted = false
     GROUP BY d::date
     ORDER BY d::date ASC`,
    [days]
  );
  return result.rows.map((r) => ({ date: r.date, value: parseInt(String(r.value), 10) }));
}

export async function getSubmissionsOverTime(days: number): Promise<TimeSeriesPoint[]> {
  const result = await pool.query<{ date: string; value: string }>(
    `SELECT
       d::date::text as date,
       COUNT(fs.pk_form_submission)::int as value
     FROM generate_series(
       CURRENT_DATE - $1::int * INTERVAL '1 day',
       CURRENT_DATE,
       '1 day'
     ) AS d
     LEFT JOIN form_submission fs
       ON fs.created_at::date = d::date
     GROUP BY d::date
     ORDER BY d::date ASC`,
    [days]
  );
  return result.rows.map((r) => ({ date: r.date, value: parseInt(String(r.value), 10) }));
}

// ─── Resource CRUD ─────────────────────────────────────────

export interface CreateResourceData {
  resource_title: string;
  resource_status: string;
  resource_category: string;
  resource_summary?: string;
  resource_content?: string;
  resource_author?: string;
  resource_region?: string;
  resource_published_at?: string;
  resource_tags?: unknown[];
  created_by?: string;
}

export async function createResource(data: CreateResourceData): Promise<ResourceItemRecord> {
  const result = await pool.query<ResourceItemRecord>(
    `INSERT INTO resource_item (
       resource_title, resource_status, resource_category, resource_summary,
       resource_content, resource_author, resource_region, resource_published_at,
       resource_tags, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [
      data.resource_title,
      data.resource_status,
      data.resource_category,
      data.resource_summary || null,
      data.resource_content || null,
      data.resource_author || null,
      data.resource_region || null,
      data.resource_published_at || null,
      JSON.stringify(data.resource_tags || []),
      data.created_by || null,
    ]
  );
  return result.rows[0];
}

export interface UpdateResourceData {
  resource_title?: string;
  resource_status?: string;
  resource_category?: string;
  resource_summary?: string;
  resource_content?: string;
  resource_author?: string;
  resource_region?: string;
  resource_published_at?: string;
  resource_tags?: unknown[];
  updated_by?: string;
}

export async function updateResource(id: string, data: UpdateResourceData): Promise<ResourceItemRecord | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, unknown> = { ...data };
  delete fieldMap.updated_by;

  // Handle resource_tags specially (needs JSON.stringify)
  if (fieldMap.resource_tags !== undefined) {
    setClauses.push(`resource_tags = $${paramIndex++}`);
    params.push(JSON.stringify(fieldMap.resource_tags));
    delete fieldMap.resource_tags;
  }

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    const existing = await pool.query<ResourceItemRecord>(
      'SELECT * FROM resource_item WHERE pk_resource_item = $1 AND is_deleted = false',
      [id]
    );
    return existing.rows[0] || null;
  }

  setClauses.push(`updated_by = $${paramIndex++}`);
  params.push(data.updated_by || null);

  setClauses.push(`updated_at = NOW()`);

  params.push(id);
  const idParam = paramIndex;

  const result = await pool.query<ResourceItemRecord>(
    `UPDATE resource_item
     SET ${setClauses.join(', ')}
     WHERE pk_resource_item = $${idParam} AND is_deleted = false
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function findResourceById(id: string): Promise<ResourceItemRecord | null> {
  const result = await pool.query<ResourceItemRecord>(
    'SELECT * FROM resource_item WHERE pk_resource_item = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Soft-delete a resource_item. Sets is_deleted = true and stamps updated_by
 * so the audit trail captures the actor. Returns true when a row was
 * actually flipped (false → already deleted / not found).
 */
export async function softDeleteResource(id: string, deletedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE resource_item
        SET is_deleted = true,
            updated_by = $2,
            updated_at = NOW()
      WHERE pk_resource_item = $1
        AND is_deleted = false`,
    [id, deletedBy]
  );
  return (result.rowCount || 0) > 0;
}

export interface CreateResourceUpdateData {
  update_title: string;
  update_description?: string;
  update_type: string;
  created_by?: string;
}

export async function createResourceUpdate(resourceId: string, data: CreateResourceUpdateData): Promise<ResourceUpdateRecord> {
  const result = await pool.query<ResourceUpdateRecord>(
    `INSERT INTO resource_update
       (fk_resource_update_resource_item, update_title, update_description, update_type, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [resourceId, data.update_title, data.update_description || null, data.update_type, data.created_by || null]
  );
  return result.rows[0];
}

// ─── Service Location CRUD ─────────────────────────────────

export interface CreateServiceLocationData {
  location_name: string;
  location_address?: string;
  location_city?: string;
  location_region?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_phone?: string;
  location_email?: string;
  location_hours?: string;
  location_services_offered?: string;
  location_accessibility_info?: string;
  location_status?: string;
  fk_service_location_service_category?: string;
  created_by?: string;
}

export async function createServiceLocation(data: CreateServiceLocationData): Promise<ServiceLocationRecord> {
  const result = await pool.query<ServiceLocationRecord>(
    `INSERT INTO service_location (
       location_name, location_address, location_city, location_region,
       location_latitude, location_longitude, location_phone, location_email,
       location_hours, location_services_offered, location_accessibility_info,
       location_status, fk_service_location_service_category, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     RETURNING *`,
    [
      data.location_name,
      data.location_address || null,
      data.location_city || null,
      data.location_region || null,
      data.location_latitude || null,
      data.location_longitude || null,
      data.location_phone || null,
      data.location_email || null,
      data.location_hours || null,
      data.location_services_offered || null,
      data.location_accessibility_info || null,
      data.location_status || 'open',
      data.fk_service_location_service_category || null,
      data.created_by || null,
    ]
  );
  return result.rows[0];
}

export interface UpdateServiceLocationData {
  location_name?: string;
  location_address?: string;
  location_city?: string;
  location_region?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_phone?: string;
  location_email?: string;
  location_hours?: string;
  location_services_offered?: string;
  location_accessibility_info?: string;
  location_status?: string;
  fk_service_location_service_category?: string;
  updated_by?: string;
}

export async function updateServiceLocation(id: string, data: UpdateServiceLocationData): Promise<ServiceLocationRecord | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, unknown> = { ...data };
  delete fieldMap.updated_by;

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    const existing = await pool.query<ServiceLocationRecord>(
      'SELECT * FROM service_location WHERE pk_service_location = $1 AND is_deleted = false',
      [id]
    );
    return existing.rows[0] || null;
  }

  setClauses.push(`updated_by = $${paramIndex++}`);
  params.push(data.updated_by || null);

  setClauses.push(`updated_at = NOW()`);

  params.push(id);
  const idParam = paramIndex;

  const result = await pool.query<ServiceLocationRecord>(
    `UPDATE service_location
     SET ${setClauses.join(', ')}
     WHERE pk_service_location = $${idParam} AND is_deleted = false
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function findServiceLocationById(id: string): Promise<ServiceLocationRecord | null> {
  const result = await pool.query<ServiceLocationRecord>(
    'SELECT * FROM service_location WHERE pk_service_location = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Soft-delete a service_location. Sets is_deleted = true and stamps
 * updated_by. Returns true when a row was flipped.
 */
export async function softDeleteServiceLocation(id: string, deletedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE service_location
        SET is_deleted = true,
            updated_by = $2,
            updated_at = NOW()
      WHERE pk_service_location = $1
        AND is_deleted = false`,
    [id, deletedBy]
  );
  return (result.rowCount || 0) > 0;
}

// ─── Form CRUD ─────────────────────────────────────────────

export interface CreateFormDefinitionData {
  form_name: string;
  form_description?: string;
  form_schema: Record<string, unknown>;
  is_published?: boolean;
  created_by?: string;
}

export async function createFormDefinition(data: CreateFormDefinitionData): Promise<FormDefinitionRecord> {
  const result = await pool.query<FormDefinitionRecord>(
    `INSERT INTO form_definition
       (form_name, form_description, form_schema, is_published, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING *`,
    [
      data.form_name,
      data.form_description || null,
      JSON.stringify(data.form_schema),
      data.is_published ?? false,
      data.created_by || null,
    ]
  );
  return result.rows[0];
}

export interface UpdateFormDefinitionData {
  form_name?: string;
  form_description?: string;
  form_schema?: Record<string, unknown>;
  is_published?: boolean;
  form_version_number?: number;
  updated_by?: string;
}

export async function updateFormDefinition(id: string, data: UpdateFormDefinitionData): Promise<FormDefinitionRecord | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.form_name !== undefined) {
    setClauses.push(`form_name = $${paramIndex++}`);
    params.push(data.form_name);
  }
  if (data.form_description !== undefined) {
    setClauses.push(`form_description = $${paramIndex++}`);
    params.push(data.form_description);
  }
  if (data.form_schema !== undefined) {
    setClauses.push(`form_schema = $${paramIndex++}`);
    params.push(JSON.stringify(data.form_schema));
  }
  if (data.is_published !== undefined) {
    setClauses.push(`is_published = $${paramIndex++}`);
    params.push(data.is_published);
  }
  if (data.form_version_number !== undefined) {
    setClauses.push(`form_version_number = $${paramIndex++}`);
    params.push(data.form_version_number);
  }

  setClauses.push(`updated_by = $${paramIndex++}`);
  params.push(data.updated_by || null);
  setClauses.push(`updated_at = NOW()`);

  params.push(id);
  const idParam = paramIndex;

  const result = await pool.query<FormDefinitionRecord>(
    `UPDATE form_definition
     SET ${setClauses.join(', ')}
     WHERE pk_form_definition = $${idParam} AND is_deleted = false
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function findFormById(id: string): Promise<FormDefinitionRecord | null> {
  const result = await pool.query<FormDefinitionRecord>(
    'SELECT * FROM form_definition WHERE pk_form_definition = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}

export async function findAllForms(): Promise<FormDefinitionRecord[]> {
  const result = await pool.query<FormDefinitionRecord>(
    'SELECT * FROM form_definition WHERE is_deleted = false ORDER BY created_at DESC'
  );
  return result.rows;
}

/**
 * Soft-delete a form_definition. Sets is_deleted = true AND is_published =
 * false in one statement so a deleted form can never surface on the public
 * forms list (which filters by is_published) even if the published flag
 * lingered from a stale cache. Stamps updated_by. Returns true on flip.
 */
export async function softDeleteFormDefinition(id: string, deletedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE form_definition
        SET is_deleted = true,
            is_published = false,
            updated_by = $2,
            updated_at = NOW()
      WHERE pk_form_definition = $1
        AND is_deleted = false`,
    [id, deletedBy]
  );
  return (result.rowCount || 0) > 0;
}

// ─── Submission Management ─────────────────────────────────

export interface AdminSubmissionFilters {
  formId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export async function findAllSubmissions(
  filters: AdminSubmissionFilters,
  page: number,
  limit: number
): Promise<FormSubmissionWithForm[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.formId) {
    clauses.push(`fs.fk_form_submission_form_definition = $${paramIndex++}`);
    params.push(filters.formId);
  }
  if (filters.status) {
    clauses.push(`fs.submission_status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.startDate) {
    clauses.push(`fs.created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push(`fs.created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await pool.query<FormSubmissionWithForm>(
    `SELECT fs.*, fd.form_name
     FROM form_submission fs
     JOIN form_definition fd ON fs.fk_form_submission_form_definition = fd.pk_form_definition
     ${whereStr}
     ORDER BY fs.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );
  return result.rows;
}

export async function countAllSubmissions(filters: AdminSubmissionFilters): Promise<number> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.formId) {
    clauses.push(`fk_form_submission_form_definition = $${paramIndex++}`);
    params.push(filters.formId);
  }
  if (filters.status) {
    clauses.push(`submission_status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.startDate) {
    clauses.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM form_submission ${whereStr}`,
    params
  );
  return parseInt(result.rows[0].count, 10);
}

export async function findSubmissionById(id: string): Promise<FormSubmissionRecord | null> {
  const result = await pool.query<FormSubmissionRecord>(
    'SELECT * FROM form_submission WHERE pk_form_submission = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Admin: find a submission by id and join the parent form_definition's
 * form_name. No ownership filter — admin can view any user's submission. The
 * raw form_definition row is fetched separately by the service so the admin
 * detail endpoint can render field labels from form_schema.
 */
export async function findSubmissionByIdWithForm(
  id: string
): Promise<FormSubmissionWithForm | null> {
  const result = await pool.query<FormSubmissionWithForm>(
    `SELECT fs.*, fd.form_name
     FROM form_submission fs
     JOIN form_definition fd ON fs.fk_form_submission_form_definition = fd.pk_form_definition
     WHERE fs.pk_form_submission = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateSubmissionStatus(
  id: string,
  status: string,
  updatedBy: string
): Promise<FormSubmissionRecord | null> {
  const result = await pool.query<FormSubmissionRecord>(
    `UPDATE form_submission
     SET submission_status = $1, updated_by = $2, updated_at = NOW()
     WHERE pk_form_submission = $3
     RETURNING *`,
    [status, updatedBy, id]
  );
  return result.rows[0] || null;
}

// ─── Service Catalogue Management ─────────────────────────

export interface CreateServiceCatalogueData {
  service_title: string;
  service_description_brief: string;
  service_description_full: string;
  fk_service_catalogue_service_category: string;
  service_eligibility?: string | null;
  service_how_to_apply?: string | null;
  service_required_documents?: string | null;
  service_contact_phone?: string | null;
  service_contact_email?: string | null;
  is_published?: boolean;
  created_by?: string;
}

export interface UpdateServiceCatalogueData {
  service_title?: string;
  service_description_brief?: string;
  service_description_full?: string;
  fk_service_catalogue_service_category?: string;
  service_eligibility?: string | null;
  service_how_to_apply?: string | null;
  service_required_documents?: string | null;
  service_contact_phone?: string | null;
  service_contact_email?: string | null;
  is_published?: boolean;
}

export async function findAllServices(): Promise<any[]> {
  const result = await pool.query(
    `SELECT sc.*, cat.category_name, cat.category_icon_name
     FROM service_catalogue sc
     LEFT JOIN service_category cat ON sc.fk_service_catalogue_service_category = cat.pk_service_category
     WHERE sc.is_deleted = false
     ORDER BY sc.updated_at DESC`
  );
  return result.rows;
}

export async function findAllServiceCategories(): Promise<any[]> {
  const result = await pool.query(
    'SELECT * FROM service_category ORDER BY category_sort_order ASC, category_name ASC'
  );
  return result.rows;
}

export async function createServiceCatalogue(data: CreateServiceCatalogueData): Promise<any> {
  const result = await pool.query(
    `INSERT INTO service_catalogue (
      service_title, service_description_brief, service_description_full,
      fk_service_catalogue_service_category, service_eligibility, service_how_to_apply,
      service_required_documents, service_contact_phone, service_contact_email,
      is_published, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      data.service_title, data.service_description_brief, data.service_description_full,
      data.fk_service_catalogue_service_category, data.service_eligibility || null,
      data.service_how_to_apply || null, data.service_required_documents || null,
      data.service_contact_phone || null, data.service_contact_email || null,
      data.is_published ?? true, data.created_by || null,
    ]
  );
  return result.rows[0];
}

export async function findServiceById(id: string): Promise<any | null> {
  const result = await pool.query(
    `SELECT sc.*, cat.category_name, cat.category_icon_name
     FROM service_catalogue sc
     LEFT JOIN service_category cat ON sc.fk_service_catalogue_service_category = cat.pk_service_category
     WHERE sc.pk_service_catalogue = $1 AND sc.is_deleted = false`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateServiceCatalogue(id: string, data: UpdateServiceCatalogueData): Promise<any | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.service_title !== undefined) { setClauses.push(`service_title = $${paramIndex++}`); params.push(data.service_title); }
  if (data.service_description_brief !== undefined) { setClauses.push(`service_description_brief = $${paramIndex++}`); params.push(data.service_description_brief); }
  if (data.service_description_full !== undefined) { setClauses.push(`service_description_full = $${paramIndex++}`); params.push(data.service_description_full); }
  if (data.fk_service_catalogue_service_category !== undefined) { setClauses.push(`fk_service_catalogue_service_category = $${paramIndex++}`); params.push(data.fk_service_catalogue_service_category); }
  if (data.service_eligibility !== undefined) { setClauses.push(`service_eligibility = $${paramIndex++}`); params.push(data.service_eligibility); }
  if (data.service_how_to_apply !== undefined) { setClauses.push(`service_how_to_apply = $${paramIndex++}`); params.push(data.service_how_to_apply); }
  if (data.service_required_documents !== undefined) { setClauses.push(`service_required_documents = $${paramIndex++}`); params.push(data.service_required_documents); }
  if (data.service_contact_phone !== undefined) { setClauses.push(`service_contact_phone = $${paramIndex++}`); params.push(data.service_contact_phone); }
  if (data.service_contact_email !== undefined) { setClauses.push(`service_contact_email = $${paramIndex++}`); params.push(data.service_contact_email); }
  if (data.is_published !== undefined) { setClauses.push(`is_published = $${paramIndex++}`); params.push(data.is_published); }

  if (setClauses.length === 0) return null;

  params.push(id);
  const result = await pool.query(
    `UPDATE service_catalogue SET ${setClauses.join(', ')} WHERE pk_service_catalogue = $${paramIndex} AND is_deleted = false RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

// ─── Notification History (admin) ──────────────────────────

export async function findAllBroadcasts(limit: number = 50): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM notification_message ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ─── Recent Submissions (for dashboard) ────────────────────

export async function getRecentSubmissions(limit: number = 5): Promise<FormSubmissionWithForm[]> {
  const result = await pool.query<FormSubmissionWithForm>(
    `SELECT fs.*, fd.form_name
     FROM form_submission fs
     JOIN form_definition fd ON fs.fk_form_submission_form_definition = fd.pk_form_definition
     ORDER BY fs.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
