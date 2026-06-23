import { Request, Response } from 'express';
import * as landingService from '../services/landing.service';
import { sendSuccess } from '../utils/response';

/**
 * GET /api/landing
 * Returns aggregated landing page data in a single API call.
 */
export async function getLandingPageData(req: Request, res: Response): Promise<void> {
  const data = await landingService.getLandingPageData();
  sendSuccess(res, data);
}
