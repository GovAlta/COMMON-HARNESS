import { ref, computed, type Ref, type ComputedRef } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  ServiceLocation,
  ServiceLocationListParams,
  ServiceLocationMarker,
} from '@/types/service-location'

export interface UseServiceLocationsReturn {
  items: Ref<ServiceLocation[]>
  /** Items with parseable lat/lng, normalised for direct map consumption. */
  markers: ComputedRef<ServiceLocationMarker[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: ServiceLocationListParams) => Promise<void>
  fetchOne: (id: string) => Promise<ServiceLocation | null>
}

function toMarker(loc: ServiceLocation): ServiceLocationMarker | null {
  if (loc.location_latitude === null || loc.location_longitude === null) {
    return null
  }
  const lat = Number(loc.location_latitude)
  const lng = Number(loc.location_longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    id: loc.pk_service_location,
    name: loc.location_name,
    lat,
    lng,
    status: loc.location_status,
    city: loc.location_city,
    region: loc.location_region,
    address: loc.location_address,
  }
}

/**
 * Composable wrapping the public service-locations API.
 * Exposes both the raw list and a marker-ready computed shape.
 */
export function useServiceLocations(): UseServiceLocationsReturn {
  const items = ref<ServiceLocation[]>([]) as Ref<ServiceLocation[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const markers = computed<ServiceLocationMarker[]>(() =>
    items.value.map(toMarker).filter((m): m is ServiceLocationMarker => m !== null),
  )

  async function refresh(params: ServiceLocationListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: ServiceLocation[]
        pagination: ApiPaginationInfo
      }>('/v1/service-locations', { params })
      items.value = res.data.data
      pagination.value = res.data.pagination
    } catch (err) {
      error.value = parseApiError(err).message
      items.value = []
      pagination.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: string): Promise<ServiceLocation | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ data: ServiceLocation }>(`/v1/service-locations/${id}`)
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  return { items, markers, pagination, loading, error, refresh, fetchOne }
}
