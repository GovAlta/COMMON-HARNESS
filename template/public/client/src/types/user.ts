/**
 * Client-side admin user-management types.
 * Mirrors server/src/types/auth.ts UserRecord plus the canonical role union
 * from server/src/middleware/authorize.ts ROLE_HIERARCHY.
 */

export type AdminRoleName =
  | 'viewer'
  | 'submitter'
  | 'editor'
  | 'manager'
  | 'admin'
  | 'super_admin'

/**
 * Row shape returned by GET /api/v1/admin/users. The legacy `user_role_name`
 * column may briefly hold `'user'` for historical rows the server has not yet
 * normalised, so we accept it on the wire and treat it as `'viewer'` in the UI.
 */
export interface AdminUser {
  pk_user_account: string
  user_email_address: string
  user_display_name: string
  user_role_name: AdminRoleName | 'user'
  sso_provider_name: string
  sso_provider_id: string
  avatar_url: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  is_deleted: boolean
}

export interface AdminUserListParams {
  page?: number
  limit?: number
  role?: AdminRoleName
  search?: string
}
