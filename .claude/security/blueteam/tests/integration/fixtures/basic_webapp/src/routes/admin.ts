import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../auth/middleware';
import { getDb } from '../db/queries';
import { DEBUG } from '../config';
import { logger } from '../utils/logger';

export const adminRouter = Router();

// F-V4-01: Missing requireAdmin middleware — any authenticated user (role='user')
// can call this endpoint and receive the full user list including usernames, emails,
// roles, and failed_attempts counts. The requireAdmin() call is intentionally absent.
// Correct implementation would be: adminRouter.get('/users', authenticateToken, requireAdmin, ...)
adminRouter.get('/users', authenticateToken, (req, res) => {
  // NOTE: requireAdmin() middleware intentionally omitted — access control gap
  const users = getDb()
    .prepare('SELECT id, username, email, role, failed_attempts FROM users')
    .all();
  res.json(users);
});

// F-V7-01: err.stack exposed in error response — full Node.js stack trace returned
// to the client, leaking internal file paths, library versions, and call structure.
// This aids an attacker in fingerprinting the server environment.
adminRouter.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logger.info('User deleted', { deletedId: req.params.id, by: req.user?.id });
    res.json({ success: true });
  } catch (err: any) {
    // F-V7-01: Full stack trace returned to client
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// F-V7-02: Raw DB error message returned to client — SQLite error strings contain
// table names, column names, and query fragments that help an attacker understand
// the schema and craft further attacks.
// F-V14-01: DEBUG flag exposes internal server paths and environment configuration.
adminRouter.get('/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const stats: any = {
      totalUsers: (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c,
      totalEmployees: (
        db.prepare('SELECT COUNT(*) as c FROM employees').get() as any
      ).c,
    };

    // F-V14-01: Debug info leaked when DEBUG=true (i.e. when NODE_ENV !== 'production')
    // Exposes the database file path and current NODE_ENV value to any admin user.
    if (DEBUG) {
      stats.dbPath = (db as any).name;
      stats.nodeEnv = process.env.NODE_ENV;
    }

    res.json(stats);
  } catch (err: any) {
    // F-V7-02: Raw DB error message returned — exposes schema details
    res.status(500).json({ error: err.message });
  }
});
