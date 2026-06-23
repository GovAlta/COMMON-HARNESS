/**
 * Client-side service catalogue types.
 * Mirrors server/src/types/service.ts.
 */

export interface ServiceCategory {
  pk_service_category: string
  category_name: string
  category_icon_name: string
  category_sort_order: number
  created_at: string
  updated_at: string
}

export interface ServiceCatalogue {
  pk_service_catalogue: string
  fk_service_catalogue_service_category: string
  service_title: string
  service_description_brief: string
  service_description_full: string
  service_eligibility: string | null
  service_how_to_apply: string | null
  service_required_documents: string | null
  service_contact_phone: string | null
  service_contact_email: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface ServiceWithCategory extends ServiceCatalogue {
  category_name: string
  category_icon_name: string
}

export interface ServiceListParams {
  page?: number
  limit?: number
  category?: string
  search?: string
}

export interface CreateServicePayload {
  service_title: string
  service_description_brief: string
  service_description_full: string
  fk_service_catalogue_service_category: string
  service_eligibility?: string | null
  service_how_to_apply?: string | null
  service_required_documents?: string | null
  service_contact_phone?: string | null
  service_contact_email?: string | null
  is_published?: boolean
}

export type UpdateServicePayload = Partial<CreateServicePayload>
