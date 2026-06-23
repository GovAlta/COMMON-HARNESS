import { pool } from '../config/database';
import type { RefreshTokenRecord } from '../types/auth';

/**
 * Create a new refresh token record.
 */
export async function create(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<RefreshTokenRecord> {
  const result = await pool.query<RefreshTokenRecord>(
    `INSERT INTO refresh_token (
      fk_refresh_token_user_account, token_hash_value, token_expires_at
    ) VALUES ($1, $2, $3)
    RETURNING *`,
    [userId, tokenHash, expiresAt.toISOString()]
  );
  return result.rows[0];
}

/**
 * Find a valid (non-revoked, non-expired) refresh token by its hash.
 */
export async function findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
  const result = await pool.query<RefreshTokenRecord>(
    `SELECT * FROM refresh_token
     WHERE token_hash_value = $1
     AND token_revoked_at IS NULL
     AND token_expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

/**
 * Revoke a specific refresh token by its hash.
 */
export async function revoke(tokenHash: string): Promise<void> {
  await pool.query(
    'UPDATE refresh_token SET token_revoked_at = NOW() WHERE token_hash_value = $1',
    [tokenHash]
  );
}

/**
 * Revoke all refresh tokens for a given user.
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await pool.query(
    'UPDATE refresh_token SET token_revoked_at = NOW() WHERE fk_refresh_token_user_account = $1 AND token_revoked_at IS NULL',
    [userId]
  );
}

/**
 * Delete expired refresh tokens (cleanup task).
 */
export async function deleteExpired(): Promise<number> {
  const result = await pool.query(
    'DELETE FROM refresh_token WHERE token_expires_at < NOW()'
  );
  return result.rowCount || 0;
}
