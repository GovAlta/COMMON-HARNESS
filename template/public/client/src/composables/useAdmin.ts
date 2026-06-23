import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  ResourceItem,
  CreateResourcePayload,
  UpdateResourcePayload,
  CreateResourceUpdatePayload,
  ResourceUpdate,
} from '@/types/resource'
import type {
  ServiceLocation,
  CreateServiceLocationPayload,
  UpdateServiceLocationPayload,
} from '@/types/service-location'
import type {
  ServiceCategory,
  ServiceCatalogue,
  CreateServicePayload,
  UpdateServicePayload,
} from '@/types/service'
import type {
  FormDefinition,
  CreateFormPayload,
  UpdateFormPayload,
} from '@/types/form'
import type {
  DashboardStats,
  AdminSubmission,
  AdminSubmissionsParams,
  SubmissionDetail,
} from '@/types/admin'
import type { SubmissionStatus } from '@/types/form'
import type { BroadcastPayload } from '@/types/notification'
import type {
  AdminUser,
  AdminUserListParams,
  AdminRoleName,
} from '@/types/user'

export interface UseAdminReturn {
  loading: Ref<boolean>
  error: Ref<string | null>

  // Dashboard
  dashboardStats: Ref<DashboardStats | null>
  fetchDashboardStats: (days?: number) => Promise<void>

  // Resources
  listResourcesAdmin: (
    params?: Record<string, unknown>,
  ) => Promise<{
    data: ResourceItem[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  } | null>
  getResourceAdmin: (id: string) => Promise<ResourceItem | null>
  createResource: (payload: CreateResourcePayload) => Promise<ResourceItem | null>
  updateResource: (id: string, payload: UpdateResourcePayload) => Promise<ResourceItem | null>
  addResourceUpdate: (
    id: string,
    payload: CreateResourceUpdatePayload,
  ) => Promise<ResourceUpdate | null>

  // Service locations
  createServiceLocation: (
    payload: CreateServiceLocationPayload,
  ) => Promise<ServiceLocation | null>
  updateServiceLocation: (
    id: string,
    payload: UpdateServiceLocationPayload,
  ) => Promise<ServiceLocation | null>

  // Services
  listAdminServices: () => Promise<ServiceCatalogue[]>
  listServiceCategories: () => Promise<ServiceCategory[]>
  createService: (payload: CreateServicePayload) => Promise<ServiceCatalogue | null>
  updateService: (id: string, payload: UpdateServicePayload) => Promise<ServiceCatalogue | null>

  // Forms
  listAdminForms: () => Promise<FormDefinition[]>
  createForm: (payload: CreateFormPayload) => Promise<FormDefinition | null>
  updateForm: (id: string, payload: UpdateFormPayload) => Promise<FormDefinition | null>

  // Submissions
  listAllSubmissions: (
    params?: AdminSubmissionsParams,
  ) => Promise<{ items: AdminSubmission[]; pagination: ApiPaginationInfo | null }>
  getSubmissionDetail: (id: string) => Promise<SubmissionDetail | null>
  updateSubmissionStatus: (
    id: string,
    status: SubmissionStatus,
  ) => Promise<AdminSubmission | null>

  // Broadcasts
  broadcast: (payload: BroadcastPayload) => Promise<unknown>

  // Users
  listUsers: (
    params: AdminUserListParams,
  ) => Promise<{ items: AdminUser[]; pagination: ApiPaginationInfo | null }>
  updateUserRole: (id: string, role: AdminRoleName) => Promise<AdminUser | null>
  setUserStatus: (id: string, isActive: boolean) => Promise<AdminUser | null>
  deleteUser: (id: string) => Promise<boolean>

  // Soft-delete (admin)
  deleteResource: (id: string) => Promise<boolean>
  deleteServiceLocation: (id: string) => Promise<boolean>
  deleteForm: (id: string) => Promise<boolean>

  // Clone (admin)
  cloneResource: (id: string) => Promise<ResourceItem | null>
  cloneService: (id: string) => Promise<ServiceCatalogue | null>
  cloneForm: (id: string) => Promise<FormDefinition | null>
}

/**
 * Aggregate composable for the admin surface. Each method calls a single
 * admin endpoint and returns the response payload (or `null` on failure
 * after surfacing the error message on the shared `error` ref).
 */
export function useAdmin(): UseAdminReturn {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dashboardStats = ref<DashboardStats | null>(null)

  async function withCall<T>(fn: () => Promise<T>): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      return await fn()
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchDashboardStats(days = 30): Promise<void> {
    const result = await withCall(async () => {
      const res = await api.get<{ data: DashboardStats }>('/v1/admin/dashboard/stats', {
        params: { days },
      })
      return res.data.data
    })
    if (result) dashboardStats.value = result
  }

  /**
   * Admin listing — returns ALL resource statuses (draft/published/archived).
   * The public /v1/resources endpoint intersects with a published-only allow-
   * list which hides drafts; admin pages call this method instead so they
   * can manage unpublished content. Backend route: GET /api/v1/admin/resources.
   */
  async function listResourcesAdmin(params: Record<string, unknown> = {}) {
    return withCall(async () => {
      const res = await api.get<{
        data: ResourceItem[]
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }>('/v1/admin/resources', { params })
      return res.data
    })
  }

  async function getResourceAdmin(id: string) {
    return withCall(async () => {
      const res = await api.get<{ data: ResourceItem }>(`/v1/admin/resources/${id}`)
      return res.data.data
    })
  }

  async function createResource(payload: CreateResourcePayload) {
    return withCall(async () => {
      const res = await api.post<{ data: ResourceItem }>('/v1/admin/resources', payload)
      return res.data.data
    })
  }

  async function updateResource(id: string, payload: UpdateResourcePayload) {
    return withCall(async () => {
      const res = await api.put<{ data: ResourceItem }>(`/v1/admin/resources/${id}`, payload)
      return res.data.data
    })
  }

  async function addResourceUpdate(id: string, payload: CreateResourceUpdatePayload) {
    return withCall(async () => {
      const res = await api.post<{ data: ResourceUpdate }>(
        `/v1/admin/resources/${id}/updates`,
        payload,
      )
      return res.data.data
    })
  }

  async function createServiceLocation(payload: CreateServiceLocationPayload) {
    return withCall(async () => {
      const res = await api.post<{ data: ServiceLocation }>(
        '/v1/admin/service-locations',
        payload,
      )
      return res.data.data
    })
  }

  async function updateServiceLocation(
    id: string,
    payload: UpdateServiceLocationPayload,
  ) {
    return withCall(async () => {
      const res = await api.put<{ data: ServiceLocation }>(
        `/v1/admin/service-locations/${id}`,
        payload,
      )
      return res.data.data
    })
  }

  async function listAdminServices(): Promise<ServiceCatalogue[]> {
    const result = await withCall(async () => {
      const res = await api.get<{ data: ServiceCatalogue[] }>('/v1/admin/services')
      return res.data.data
    })
    return result ?? []
  }

  async function listServiceCategories(): Promise<ServiceCategory[]> {
    const result = await withCall(async () => {
      const res = await api.get<{ data: ServiceCategory[] }>('/v1/admin/service-categories')
      return res.data.data
    })
    return result ?? []
  }

  async function createService(payload: CreateServicePayload) {
    return withCall(async () => {
      const res = await api.post<{ data: ServiceCatalogue }>('/v1/admin/services', payload)
      return res.data.data
    })
  }

  async function updateService(id: string, payload: UpdateServicePayload) {
    return withCall(async () => {
      const res = await api.put<{ data: ServiceCatalogue }>(`/v1/admin/services/${id}`, payload)
      return res.data.data
    })
  }

  async function listAdminForms(): Promise<FormDefinition[]> {
    const result = await withCall(async () => {
      const res = await api.get<{ data: FormDefinition[] }>('/v1/admin/forms')
      return res.data.data
    })
    return result ?? []
  }

  async function createForm(payload: CreateFormPayload) {
    return withCall(async () => {
      const res = await api.post<{ data: FormDefinition }>('/v1/admin/forms', payload)
      return res.data.data
    })
  }

  async function updateForm(id: string, payload: UpdateFormPayload) {
    return withCall(async () => {
      const res = await api.put<{ data: FormDefinition }>(`/v1/admin/forms/${id}`, payload)
      return res.data.data
    })
  }

  async function listAllSubmissions(
    params: AdminSubmissionsParams = {},
  ): Promise<{ items: AdminSubmission[]; pagination: ApiPaginationInfo | null }> {
    const result = await withCall(async () => {
      const res = await api.get<{
        data: AdminSubmission[]
        pagination: ApiPaginationInfo
      }>('/v1/admin/submissions', { params })
      return { items: res.data.data, pagination: res.data.pagination }
    })
    return result ?? { items: [], pagination: null }
  }

  async function getSubmissionDetail(id: string): Promise<SubmissionDetail | null> {
    return withCall(async () => {
      const res = await api.get<{ data: SubmissionDetail }>(
        `/v1/admin/submissions/${id}`,
      )
      return res.data.data
    })
  }

  async function updateSubmissionStatus(id: string, status: SubmissionStatus) {
    return withCall(async () => {
      const res = await api.put<{ data: AdminSubmission }>(
        `/v1/admin/submissions/${id}/status`,
        { status },
      )
      return res.data.data
    })
  }

  async function broadcast(payload: BroadcastPayload) {
    return withCall(async () => {
      const res = await api.post('/v1/admin/notifications/broadcast', payload)
      return res.data
    })
  }

  async function listUsers(
    params: AdminUserListParams,
  ): Promise<{ items: AdminUser[]; pagination: ApiPaginationInfo | null }> {
    const result = await withCall(async () => {
      const res = await api.get<{
        data: AdminUser[]
        pagination: ApiPaginationInfo
      }>('/v1/admin/users', { params })
      return { items: res.data.data, pagination: res.data.pagination }
    })
    return result ?? { items: [], pagination: null }
  }

  async function updateUserRole(id: string, role: AdminRoleName) {
    return withCall(async () => {
      const res = await api.put<{ data: AdminUser }>(`/v1/admin/users/${id}/role`, { role })
      return res.data.data
    })
  }

  async function setUserStatus(id: string, isActive: boolean) {
    return withCall(async () => {
      const res = await api.put<{ data: AdminUser }>(`/v1/admin/users/${id}/status`, {
        isActive,
      })
      return res.data.data
    })
  }

  async function deleteUser(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.delete(`/v1/admin/users/${id}`)
      return true
    })
    return result === true
  }

  async function deleteResource(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.delete(`/v1/admin/resources/${id}`)
      return true
    })
    return result === true
  }

  async function deleteServiceLocation(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.delete(`/v1/admin/service-locations/${id}`)
      return true
    })
    return result === true
  }

  async function deleteForm(id: string): Promise<boolean> {
    const result = await withCall(async () => {
      await api.delete(`/v1/admin/forms/${id}`)
      return true
    })
    return result === true
  }

  // ─── Clone ──────────────────────────────────────────────
  // Each clone endpoint returns 201 with the new row in the standard envelope
  // ({ data: T }). The server appends " (DRAFT)" to the title, flips publish
  // to false, generates a fresh UUID, and writes an audit row with
  // metadata { clone_of }.

  async function cloneResource(id: string) {
    return withCall(async () => {
      const res = await api.post<{ data: ResourceItem }>(
        `/v1/admin/resources/${id}/clone`,
      )
      return res.data.data
    })
  }

  async function cloneService(id: string) {
    return withCall(async () => {
      const res = await api.post<{ data: ServiceCatalogue }>(
        `/v1/admin/services/${id}/clone`,
      )
      return res.data.data
    })
  }

  async function cloneForm(id: string) {
    return withCall(async () => {
      const res = await api.post<{ data: FormDefinition }>(
        `/v1/admin/forms/${id}/clone`,
      )
      return res.data.data
    })
  }

  return {
    loading,
    error,
    dashboardStats,
    fetchDashboardStats,
    listResourcesAdmin,
    getResourceAdmin,
    createResource,
    updateResource,
    addResourceUpdate,
    createServiceLocation,
    updateServiceLocation,
    listAdminServices,
    listServiceCategories,
    createService,
    updateService,
    listAdminForms,
    createForm,
    updateForm,
    listAllSubmissions,
    getSubmissionDetail,
    updateSubmissionStatus,
    broadcast,
    listUsers,
    updateUserRole,
    setUserStatus,
    deleteUser,
    deleteResource,
    deleteServiceLocation,
    deleteForm,
    cloneResource,
    cloneService,
    cloneForm,
  }
}
