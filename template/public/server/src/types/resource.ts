/**
 * Server-side resource and service location type definitions.
 * These match the database column names exactly.
 */

export interface ResourceItemRecord {
  pk_resource_item: string;
  resource_title: string;
  resource_status: ResourceStatus;
  resource_category: ResourceCategory;
  resource_summary: string | null;
  resource_content: string | null;
  resource_author: string | null;
  resource_region: string | null;
  resource_published_at: string | null;
  resource_tags: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
}

export interface ResourceUpdateRecord {
  pk_resource_update: string;
  fk_resource_update_resource_item: string;
  update_title: string;
  update_description: string | null;
  update_type: ResourceUpdateType;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ServiceLocationRecord {
  pk_service_location: string;
  fk_service_location_service_category: string | null;
  location_name: string;
  location_address: string | null;
  location_city: string | null;
  location_region: string | null;
  location_latitude: string | null; // DECIMAL comes back as string from pg
  location_longitude: string | null;
  location_phone: string | null;
  location_email: string | null;
  location_hours: string | null;
  location_services_offered: string | null;
  location_accessibility_info: string | null;
  location_status: ServiceLocationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
}

export type ResourceStatus = 'published' | 'draft' | 'archived';
export type ResourceCategory = 'guide' | 'announcement' | 'policy' | 'reference' | 'bulletin';
export type ResourceUpdateType = 'revision' | 'correction' | 'supplement' | 'status_change';
export type ServiceLocationStatus = 'open' | 'closed' | 'limited';

/**
 * Filters passed from the controller to the service layer.
 * Keys match query parameter names, NOT database column names.
 */
export interface ResourceFilters {
  status?: string[];
  category?: string[];
  region?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Filters for service location queries.
 */
export interface ServiceLocationFilters {
  status?: string;
  region?: string;
  category?: string;
  search?: string;
}

/**
 * Pagination options object.
 */
export interface PaginationOptions {
  sort: string;
  order: 'asc' | 'desc';
  page: number;
  limit: number;
}
