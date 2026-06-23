import { Router } from 'express';
import { getHealth, getLiveness, getReadiness } from '../controllers/health.controller';

const router = Router();

// Health check endpoints - no authentication required
router.get('/health', getHealth);
router.get('/health/live', getLiveness);
router.get('/health/ready', getReadiness);

export default router;
