import { pool } from '../config/database';

export interface AuditLogEntry {
  pk_audit_log: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Create an audit log entry for data mutations.
 */
export async function createAuditEntry(
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  userId: string | null,
  ipAddress: string | null
): Promise<AuditLogEntry> {
  const result = await pool.query<AuditLogEntry>(
    `INSERT INTO audit_log
      (table_name, record_id, action, old_data, new_data, user_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tableName,
      recordId,
      action,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      userId,
      ipAddress,
    ]
  );
  return result.rows[0];
}
