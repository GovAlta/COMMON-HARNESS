import { pool } from '../config/database';
import type {
  ServiceLocationRecord,
  ServiceLocationFilters,
  PaginationOptions,
} from '../types/resource';

/**
 * Allowed sort columns — maps API sort param to actual DB column name.
 * This prevents SQL injection via sort parameter.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  location_name: 'location_name',
  location_city: 'location_city',
  location_region: 'location_region',
  location_status: 'location_status',
  updated_at: 'updated_at',
  created_at: 'created_at',
};

/**
 * Build WHERE clauses and params from filter object.
 */
function buildWhereClause(filters: ServiceLocationFilters): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    clauses.push(`location_status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.region) {
    clauses.push(`location_region ILIKE $${paramIndex++}`);
    params.push(`%${filters.region}%`);
  }

  if (filters.category) {
    clauses.push(`fk_service_location_service_category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.search) {
    clauses.push(
      `(location_name ILIKE $${paramIndex} OR location_city ILIKE $${paramIndex} OR location_services_offered ILIKE $${paramIndex})`
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  return { clauses, params };
}

/**
 * Find all service locations with filtering, sorting, and pagination.
 */
export async function findAll(
  filters: ServiceLocationFilters,
  options: PaginationOptions
): Promise<ServiceLocationRecord[]> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const sortColumn = ALLOWED_SORT_COLUMNS[options.sort] || 'location_name';
  const sortOrder = options.order === 'asc' ? 'ASC' : 'DESC';

  const offset = (options.page - 1) * options.limit;
  const paramIndex = params.length + 1;

  const query = `
    SELECT *
    FROM service_location
    ${whereStr}
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(options.limit, offset);

  const result = await pool.query<ServiceLocationRecord>(query, params);
  return result.rows;
}

/**
 * Count all service locations matching filters (for pagination metadata).
 */
export async function countAll(filters: ServiceLocationFilters): Promise<number> {
  const { clauses, params } = buildWhereClause(filters);
  const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `SELECT COUNT(*) as count FROM service_location ${whereStr}`;
  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a single service location by ID.
 */
export async function findById(id: string): Promise<ServiceLocationRecord | null> {
  const result = await pool.query<ServiceLocationRecord>(
    'SELECT * FROM service_location WHERE pk_service_location = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}
