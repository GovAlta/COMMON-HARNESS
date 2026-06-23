/**
 * Client-side resource and resource-update types.
 * Mirrors server/src/types/resource.ts — keep aligned.
 */

export type ResourceStatus = 'published' | 'draft' | 'archived'
export type ResourceCategory = 'guide' | 'announcement' | 'policy' | 'reference' | 'bulletin'
export type ResourceUpdateType = 'revision' | 'correction' | 'supplement' | 'status_change'

export interface ResourceItem {
  pk_resource_item: string
  resource_title: string
  resource_status: ResourceStatus
  resource_category: ResourceCategory
  resource_summary: string | null
  resource_content: string | null
  resource_author: string | null
  resource_region: string | null
  resource_published_at: string | null
  resource_tags: unknown[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ResourceUpdate {
  pk_resource_update: string
  fk_resource_update_resource_item: string
  update_title: string
  update_description: string | null
  update_type: ResourceUpdateType
  created_at: string
  updated_at: string
}

export interface ResourceListParams {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  status?: string
  category?: string
  region?: string
  search?: string
  startDate?: string
  endDate?: string
}

export interface CreateResourcePayload {
  resource_title: string
  resource_status?: ResourceStatus
  resource_category: ResourceCategory
  resource_summary?: string
  resource_content?: string
  resource_author?: string
  resource_region?: string
  resource_published_at?: string
  resource_tags?: string[]
}

export type UpdateResourcePayload = Partial<CreateResourcePayload>

export interface CreateResourceUpdatePayload {
  update_title: string
  update_description?: string
  update_type: ResourceUpdateType
}
