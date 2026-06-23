import { pool } from '../config/database';

export interface LandingPageData {
  stats: {
    publishedResourceCount: number;
    serviceLocationCount: number;
    activeFormCount: number;
  };
  featuredResources: Array<{
    id: string;
    title: string;
    status: string;
    category: string;
    summary: string | null;
    author: string | null;
    region: string | null;
    publishedAt: string | null;
  }>;
  serviceHighlights: Array<{
    id: string;
    title: string;
    descriptionBrief: string;
    categoryName: string;
    categoryIcon: string;
  }>;
  recentUpdates: Array<{
    id: string;
    resourceId: string;
    resourceTitle: string;
    title: string;
    description: string | null;
    type: string;
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
}

/**
 * Safely execute a query, returning a default value if the table doesn't exist.
 * This allows the landing page to work even before all migrations have run.
 */
async function safeQuery<T>(queryText: string, params: unknown[] = [], defaultValue: T): Promise<T> {
  try {
    const result = await pool.query(queryText, params);
    return result.rows as unknown as T;
  } catch (err: any) {
    // 42P01 = undefined_table — table doesn't exist yet
    if (err?.code === '42P01') {
      return defaultValue;
    }
    throw err;
  }
}

/**
 * Fetch aggregated landing page data from multiple tables.
 * Gracefully handles missing tables (pre-migration state).
 */
export async function getLandingPageData(): Promise<LandingPageData> {
  // Run queries in parallel for efficiency, each with graceful fallback
  const [
    statsRows,
    featuredResources,
    serviceHighlights,
    recentUpdates,
    announcements,
  ] = await Promise.all([
    // 1. Summary statistics (uses subqueries so we wrap the whole thing)
    safeQuery<Array<Record<string, string>>>(
      `SELECT
        COALESCE((SELECT COUNT(*) FROM resource_item WHERE resource_status = 'published' AND is_deleted = false), 0) AS published_resource_count,
        COALESCE((SELECT COUNT(*) FROM service_location WHERE is_deleted = false), 0) AS service_location_count,
        COALESCE((SELECT COUNT(*) FROM form_definition WHERE is_published = true AND is_deleted = false), 0) AS active_form_count`,
      [],
      [{ published_resource_count: '0', service_location_count: '0', active_form_count: '0' }]
    ),

    // 2. Featured resources (top 6 published)
    safeQuery(
      `SELECT
        pk_resource_item AS id,
        resource_title AS title,
        resource_status AS status,
        resource_category AS category,
        resource_summary AS summary,
        resource_author AS author,
        resource_region AS region,
        resource_published_at AS "publishedAt"
      FROM resource_item
      WHERE is_deleted = false
        AND resource_status = 'published'
      ORDER BY resource_published_at DESC NULLS LAST
      LIMIT 6`,
      [],
      []
    ),

    // 3. Service highlights (top 6 published services)
    safeQuery(
      `SELECT
        sc.pk_service_catalogue AS id,
        sc.service_title AS title,
        sc.service_description_brief AS "descriptionBrief",
        cat.category_name AS "categoryName",
        cat.category_icon_name AS "categoryIcon"
      FROM service_catalogue sc
      JOIN service_category cat ON cat.pk_service_category = sc.fk_service_catalogue_service_category
      WHERE sc.is_published = true
        AND sc.is_deleted = false
      ORDER BY cat.category_sort_order ASC, sc.created_at ASC
      LIMIT 6`,
      [],
      []
    ),

    // 4. Recent updates (from resource_update table)
    safeQuery(
      `SELECT
        ru.pk_resource_update AS id,
        ru.fk_resource_update_resource_item AS "resourceId",
        ri.resource_title AS "resourceTitle",
        ru.update_title AS title,
        ru.update_description AS description,
        ru.update_type AS type,
        ru.created_at AS "createdAt"
      FROM resource_update ru
      JOIN resource_item ri ON ri.pk_resource_item = ru.fk_resource_update_resource_item
      WHERE ri.is_deleted = false
      ORDER BY ru.created_at DESC
      LIMIT 5`,
      [],
      []
    ),

    // 5. Announcements (from notification_message)
    safeQuery(
      `SELECT
        pk_notification_message AS id,
        message_title AS title,
        message_body AS body,
        created_at AS "createdAt"
      FROM notification_message
      WHERE message_type = 'announcement'
      ORDER BY created_at DESC
      LIMIT 5`,
      [],
      []
    ),
  ]);

  const stats = statsRows[0] || {
    published_resource_count: '0',
    service_location_count: '0',
    active_form_count: '0',
  };

  return {
    stats: {
      publishedResourceCount: parseInt(stats.published_resource_count, 10),
      serviceLocationCount: parseInt(stats.service_location_count, 10),
      activeFormCount: parseInt(stats.active_form_count, 10),
    },
    featuredResources: featuredResources as LandingPageData['featuredResources'],
    serviceHighlights: serviceHighlights as LandingPageData['serviceHighlights'],
    recentUpdates: recentUpdates as LandingPageData['recentUpdates'],
    announcements: announcements as LandingPageData['announcements'],
  };
}
