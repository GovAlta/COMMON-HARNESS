/**
 * Client-side service location types.
 * Mirrors server/src/types/resource.ts ServiceLocationRecord.
 */

export type ServiceLocationStatus = 'open' | 'closed' | 'limited'

export interface ServiceLocation {
  pk_service_location: string
  fk_service_location_service_category: string | null
  location_name: string
  location_address: string | null
  location_city: string | null
  location_region: string | null
  /** DECIMAL from Postgres arrives as string; convert via Number() for map use. */
  location_latitude: string | null
  location_longitude: string | null
  location_phone: string | null
  location_email: string | null
  location_hours: string | null
  location_services_offered: string | null
  location_accessibility_info: string | null
  location_status: ServiceLocationStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * A trimmed marker shape with parsed numeric coordinates,
 * suitable for direct consumption by the map component.
 */
export interface ServiceLocationMarker {
  id: string
  name: string
  lat: number
  lng: number
  status: ServiceLocationStatus
  city: string | null
  region: string | null
  address: string | null
}

export interface ServiceLocationListParams {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  status?: ServiceLocationStatus
  region?: string
  category?: string
  search?: string
}

export interface CreateServiceLocationPayload {
  location_name: string
  location_address?: string
  location_city?: string
  location_region?: string
  location_latitude?: number
  location_longitude?: number
  location_phone?: string
  location_email?: string
  location_hours?: string
  location_services_offered?: string
  location_accessibility_info?: string
  location_status?: ServiceLocationStatus
  fk_service_location_service_category?: string
}

export type UpdateServiceLocationPayload = Partial<CreateServiceLocationPayload>
