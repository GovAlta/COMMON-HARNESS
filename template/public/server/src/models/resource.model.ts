import { pool } from '../config/database';
import type {
  ResourceItemRecord,
  ResourceUpdateRecord,
  ResourceFilters,
  PaginationOptions,
} from '../types/resource';

/**
 * Allowed sort columns — maps API sort param to actual DB column name.
 * This prevents SQL injection via sort parameter.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  resource_title: 'resource_title',
  resource_status: 'resource_status',
  resource_category: 'resource_category',
  resource_region: 'resource_region',
  resource_published_at: 'resource_published_at',
  updated_at: 'updated_at',
  created_at: 'created_at',
};

/**
 * Build WHERE clauses and params from filter object.
 * Maps filter keys (API names) to database column names.
 */
function buildWhereClause(filters: ResourceFilters): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Status filter (multi-value)
  if (filters.status && filters.status.length > 0) {
    const placeholders = filters.status.map(() => `$${paramIndex++}`);
    clauses.push(`resource_status IN (${placeholders.join(', ')})`);
    params.push(...filters.status);
  }

  // Category filter (multi-value)
  if (filters.category && filters.category.length > 0) {
    const placeholders = filters.category.map(() => `$${paramIndex++}`);
    clauses.push(`resource_category IN (${placeholders.join(', ')})`);
    params.push(...filters.category);
  }

  // Region filter
  if (filters.region) {
    clauses.push(`resource_region ILIKE $${paramIndex++}`);
    params.push(`%${filters.region}%`);
  }

  // Search filter (title, summary, or author)
  if (filters.search) {
    clauses.push(
      `(resource_title ILIKE $${paramIndex} OR resource_summary ILIKE $${paramIndex} OR resource_author ILIKE $${paramIndex})`
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  // Date range filter (on published_at)
  if (filters.startDate) {
    clauses.push(`resource_published_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push(`resource_published_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  return { clauses, params };
}

/**
 * Find all resource items with filtering, sorting, and pagination.
 */
export async function findAll(
  filters: ResourceFilters,
  options: PaginationOptions
): Promise<ResourceItemRecord[]> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  // Safe sort column lookup
  const sortColumn = ALLOWED_SORT_COLUMNS[options.sort] || 'updated_at';
  const sortOrder = options.order === 'asc' ? 'ASC' : 'DESC';

  const offset = (options.page - 1) * options.limit;
  const paramIndex = params.length + 1;

  const query = `
    SELECT *
    FROM resource_item
    ${whereStr}
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(options.limit, offset);

  const result = await pool.query<ResourceItemRecord>(query, params);
  return result.rows;
}

/**
 * Count all resource items matching filters (for pagination metadata).
 */
export async function countAll(filters: ResourceFilters): Promise<number> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `SELECT COUNT(*) as count FROM resource_item ${whereStr}`;
  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a single PUBLISHED resource item by ID.
 *
 * Filters on resource_status='published' to prevent draft/archived resources
 * from leaking out of the public GET /resources/:id route (the only caller).
 * UUID v4 entropy alone is not protection — any leak (audit-log export,
 * indexed link, search-engine cache) would otherwise expose unfinished or
 * retired content. Admin paths that need draft/archived access should use a
 * separate model function rather than relaxing this one. Redteam finding
 * RT-RES-001 (draft-by-UUID leak).
 */
export async function findById(id: string): Promise<ResourceItemRecord | null> {
  const result = await pool.query<ResourceItemRecord>(
    "SELECT * FROM resource_item WHERE pk_resource_item = $1 AND is_deleted = false AND resource_status = 'published'",
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find updates for a resource, newest first, with pagination.
 */
export async function findUpdates(
  resourceId: string,
  page: number,
  limit: number
): Promise<ResourceUpdateRecord[]> {
  const offset = (page - 1) * limit;
  const result = await pool.query<ResourceUpdateRecord>(
    `SELECT * FROM resource_update
     WHERE fk_resource_update_resource_item = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [resourceId, limit, offset]
  );
  return result.rows;
}

/**
 * Count updates for a resource (for pagination metadata).
 */
export async function countUpdates(resourceId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM resource_update WHERE fk_resource_update_resource_item = $1',
    [resourceId]
  );
  return parseInt(result.rows[0].count, 10);
}
