import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, requireAdmin } from '../auth/middleware';
import { getDb } from '../db/queries';
import { logger } from '../utils/logger';

export const reportsRouter = Router();

// P-V11-01: Rate limited — 20 requests per 15-minute window per IP.
// Prevents bulk automated scraping of aggregated Protected A data via this endpoint.
const reportsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' },
});

// P-V11-01: rate limited
// P-V4-01: admin only — requireAdmin ensures only role='admin' tokens reach this handler
reportsRouter.get(
  '/department-summary',
  reportsLimiter,        // P-V11-01
  authenticateToken,
  requireAdmin,          // P-V4-01
  (req, res) => {
    try {
      const db = getDb();

      // P-V5-01: Static parameterized query — no user input interpolated into SQL.
      // department filter is not exposed as a query param; summary is always full-table.
      // P-V11-02: LIMIT 50 prevents bulk extraction even if the employees table grows large.
      const summary = db
        .prepare(
          `SELECT department, COUNT(*) as headcount
           FROM employees
           GROUP BY department
           ORDER BY headcount DESC
           LIMIT 50`   // P-V11-02: LIMIT 50 prevents bulk extraction
        )
        .all();

      // P-V8-01: Only non-PII metadata logged — user ID and result count, not employee data
      logger.info('Department summary generated', {
        requestedBy: req.user?.id,
        resultCount: summary.length,
      });

      res.json(summary);
    } catch (_err) {
      // P-V7-01: Generic error — does not expose DB error message or stack trace
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
);
