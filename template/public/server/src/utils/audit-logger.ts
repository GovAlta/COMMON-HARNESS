import { pool } from '../config/database';
import logger from './logger';

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'TOKEN_REFRESH' |
  'INSERT' | 'UPDATE' | 'DELETE' | 'AI_CHAT' | 'AI_IMAGE' | 'FORM_SUBMIT' |
  'FORM_DRAFT_SAVE' | 'FORM_DRAFT_UPDATE' | 'FORM_DRAFT_SUBMIT' | 'FORM_RETRACT' | 'RATE_LIMIT';

export interface AuditEvent {
  action: AuditAction;
  tableName: string;
  recordId?: string;
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.tableName,
        event.recordId || null,
        event.action,
        event.oldData ? JSON.stringify(event.oldData) : null,
        (event.newData || event.metadata)
          ? JSON.stringify({ ...(event.newData || {}), ...(event.metadata || {}) })
          : null,
        event.userId || null,
        event.ipAddress || null,
        event.userAgent || null,
      ]
    );
  } catch (err) {
    // Never let audit logging failure crash the app
    logger.error('Audit logging failed', { error: (err as Error).message, event: event.action });
  }
}
