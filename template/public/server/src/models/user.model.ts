import { pool } from '../config/database';
import type { UserRecord, SSOProfile } from '../types/auth';

/**
 * Find a user by email address.
 */
export async function findByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'SELECT * FROM user_account WHERE LOWER(user_email_address) = LOWER($1) AND is_deleted = false',
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by primary key.
 */
export async function findById(id: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'SELECT * FROM user_account WHERE pk_user_account = $1 AND is_deleted = false',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by SSO provider ID.
 */
export async function findByProviderId(
  provider: 'google' | 'microsoft',
  providerId: string
): Promise<UserRecord | null> {
  // Hardcoded queries per provider — eliminates any dynamic SQL identifier path
  // and makes the parameterization story trivially auditable by SAST tooling.
  const sql = provider === 'google'
    ? 'SELECT * FROM user_account WHERE google_id = $1 AND is_deleted = false'
    : 'SELECT * FROM user_account WHERE microsoft_id = $1 AND is_deleted = false';
  const result = await pool.query<UserRecord>(sql, [providerId]);
  return result.rows[0] || null;
}

/**
 * Create a new user from an SSO profile.
 */
export async function createUser(profile: SSOProfile): Promise<UserRecord> {
  const googleId = profile.provider === 'google' ? profile.providerId : null;
  const microsoftId = profile.provider === 'microsoft' ? profile.providerId : null;

  const result = await pool.query<UserRecord>(
    `INSERT INTO user_account (
      user_email_address, user_display_name, sso_provider_name, sso_provider_id,
      google_id, microsoft_id, avatar_url, last_login_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *`,
    [
      profile.email,
      profile.displayName,
      profile.provider,
      profile.providerId,
      googleId,
      microsoftId,
      profile.avatarUrl || null,
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing user's SSO profile and last login.
 */
export async function updateUser(
  userId: string,
  profile: Partial<SSOProfile>
): Promise<UserRecord | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (profile.displayName) {
    setClauses.push(`user_display_name = $${paramIndex++}`);
    values.push(profile.displayName);
  }

  if (profile.avatarUrl !== undefined) {
    setClauses.push(`avatar_url = $${paramIndex++}`);
    values.push(profile.avatarUrl);
  }

  if (profile.provider === 'google' && profile.providerId) {
    setClauses.push(`google_id = $${paramIndex++}`);
    values.push(profile.providerId);
  }

  if (profile.provider === 'microsoft' && profile.providerId) {
    setClauses.push(`microsoft_id = $${paramIndex++}`);
    values.push(profile.providerId);
  }

  setClauses.push(`last_login_at = NOW()`);
  values.push(userId);

  const result = await pool.query<UserRecord>(
    `UPDATE user_account SET ${setClauses.join(', ')} WHERE pk_user_account = $${paramIndex} AND is_deleted = false RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Update the last_login_at timestamp for a user.
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await pool.query(
    'UPDATE user_account SET last_login_at = NOW() WHERE pk_user_account = $1',
    [userId]
  );
}

/**
 * Admin: list users with pagination + optional role / email filter.
 * Returns rows and the total count so the client can paginate.
 */
export async function listUsers(opts: {
  page: number;
  limit: number;
  role?: string;
  search?: string;
}): Promise<{ items: UserRecord[]; total: number }> {
  const where: string[] = ['is_deleted = false'];
  const params: unknown[] = [];
  if (opts.role) {
    params.push(opts.role);
    where.push(`user_role_name = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search.toLowerCase()}%`);
    where.push(`(LOWER(user_email_address) LIKE $${params.length} OR LOWER(user_display_name) LIKE $${params.length})`);
  }

  const offset = (opts.page - 1) * opts.limit;
  params.push(opts.limit, offset);

  const sql = `
    SELECT *,
           COUNT(*) OVER() AS _total_count
    FROM user_account
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await pool.query<UserRecord & { _total_count: string }>(sql, params);
  const total = result.rows.length > 0 ? parseInt(result.rows[0]._total_count, 10) : 0;
  const items = result.rows.map((row) => {
    // Strip the windowed total from the returned shape so the type stays clean.
    const { _total_count: _t, ...rest } = row;
    return rest as UserRecord;
  });
  return { items, total };
}

/**
 * Admin: change a user's role. Returns the updated row or null when the
 * target does not exist / is deleted.
 */
export async function updateRole(userId: string, role: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'UPDATE user_account SET user_role_name = $1, updated_at = NOW() WHERE pk_user_account = $2 AND is_deleted = false RETURNING *',
    [role, userId]
  );
  return result.rows[0] || null;
}

/**
 * Admin: toggle a user's is_active flag. Inactive users keep their record
 * (and any FR-mandated audit references) but cannot authenticate.
 * Returns the updated row or null when the target does not exist / is
 * already soft-deleted.
 */
export async function updateActiveStatus(
  userId: string,
  isActive: boolean
): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'UPDATE user_account SET is_active = $1, updated_at = NOW() WHERE pk_user_account = $2 AND is_deleted = false RETURNING *',
    [isActive, userId]
  );
  return result.rows[0] || null;
}

/**
 * Admin: soft-delete a user. Sets is_deleted = true and is_active = false in
 * a single statement so list/read queries (which already filter is_deleted)
 * stop returning the row and the user cannot reauthenticate. Records are
 * retained for audit; a separate restore endpoint can flip them back.
 * Returns true when a row was updated, false otherwise.
 */
export async function softDelete(userId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE user_account
        SET is_deleted = true,
            is_active = false,
            updated_at = NOW()
      WHERE pk_user_account = $1
        AND is_deleted = false`,
    [userId]
  );
  return (result.rowCount || 0) > 0;
}
