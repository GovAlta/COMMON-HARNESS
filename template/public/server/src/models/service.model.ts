import { pool } from '../config/database';
import type {
  ServiceCategoryRecord,
  ServiceWithCategory,
  ServiceFilters,
} from '../types/service';

/**
 * Build WHERE clauses and params from filter object.
 * Maps filter keys (API names) to database column names only in the model layer.
 */
function buildWhereClause(filters: ServiceFilters): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = ['sc.is_published = true', 'sc.is_deleted = false'];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Category filter — supports UUID or category name
  if (filters.category) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.category);
    if (isUuid) {
      clauses.push(`sc.fk_service_catalogue_service_category = $${paramIndex++}`);
      params.push(filters.category);
    } else {
      clauses.push(`cat.category_name ILIKE $${paramIndex++}`);
      params.push(filters.category);
    }
  }

  // Search filter — uses ILIKE on title and brief description
  if (filters.search) {
    clauses.push(
      `(sc.service_title ILIKE $${paramIndex} OR sc.service_description_brief ILIKE $${paramIndex})`
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  return { clauses, params };
}

/**
 * Find all published services with filtering and pagination.
 * Joins with service_category for category name and icon.
 */
export async function findAll(
  filters: ServiceFilters,
  page: number,
  limit: number
): Promise<ServiceWithCategory[]> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const offset = (page - 1) * limit;
  const paramIndex = params.length + 1;

  const query = `
    SELECT
      sc.*,
      cat.category_name,
      cat.category_icon_name
    FROM service_catalogue sc
    JOIN service_category cat ON sc.fk_service_catalogue_service_category = cat.pk_service_category
    ${whereStr}
    ORDER BY cat.category_sort_order ASC, sc.service_title ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await pool.query<ServiceWithCategory>(query, params);
  return result.rows;
}

/**
 * Count all published services matching filters (for pagination metadata).
 */
export async function countAll(filters: ServiceFilters): Promise<number> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `
    SELECT COUNT(*) as count
    FROM service_catalogue sc
    JOIN service_category cat ON sc.fk_service_catalogue_service_category = cat.pk_service_category
    ${whereStr}
  `;

  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a single service by ID with category info.
 * Returns null if not found, unpublished, or soft-deleted.
 */
export async function findById(id: string): Promise<ServiceWithCategory | null> {
  const result = await pool.query<ServiceWithCategory>(
    `SELECT
      sc.*,
      cat.category_name,
      cat.category_icon_name
    FROM service_catalogue sc
    JOIN service_category cat ON sc.fk_service_catalogue_service_category = cat.pk_service_category
    WHERE sc.pk_service_catalogue = $1
      AND sc.is_published = true
      AND sc.is_deleted = false`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find all categories ordered by sort_order.
 */
export async function findCategories(): Promise<ServiceCategoryRecord[]> {
  const result = await pool.query<ServiceCategoryRecord>(
    'SELECT * FROM service_category ORDER BY category_sort_order ASC'
  );
  return result.rows;
}
