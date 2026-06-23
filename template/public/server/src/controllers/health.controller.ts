import { Request, Response } from 'express';
import { pool } from '../config/database';
import { sendSuccess, sendError } from '../utils/response';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

/**
 * GET /health
 * Basic health check - returns ok if the process is running.
 * Intended for simple load balancer checks.
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, { status: 'ok' });
});

/**
 * GET /health/live
 * Liveness probe - lightweight check that the process is alive.
 * No dependency calls — just confirms the event loop is responsive.
 */
export const getLiveness = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, { status: 'alive' });
});

/**
 * GET /health/ready
 * Readiness probe - verifies database connectivity with latency measurement.
 */
export const getReadiness = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    sendSuccess(res, {
      status: 'ready',
      dependencies: {
        database: { status: 'connected', latencyMs },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'not_ready',
      dependencies: {
        database: { status: 'disconnected', error: message },
      },
    });
  }
});
