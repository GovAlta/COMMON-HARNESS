/**
 * Server-side service catalogue type definitions.
 * These match the database column names exactly.
 */

export interface ServiceCategoryRecord {
  pk_service_category: string;
  category_name: string;
  category_icon_name: string;
  category_sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ServiceCatalogueRecord {
  pk_service_catalogue: string;
  fk_service_catalogue_service_category: string;
  service_title: string;
  service_description_brief: string;
  service_description_full: string;
  service_eligibility: string | null;
  service_how_to_apply: string | null;
  service_required_documents: string | null;
  service_contact_phone: string | null;
  service_contact_email: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
}

/**
 * Service with joined category info, returned by list/detail queries.
 */
export interface ServiceWithCategory extends ServiceCatalogueRecord {
  category_name: string;
  category_icon_name: string;
}

/**
 * Filters passed from the controller to the service layer.
 */
export interface ServiceFilters {
  category?: string; // UUID or category name
  search?: string;
}
