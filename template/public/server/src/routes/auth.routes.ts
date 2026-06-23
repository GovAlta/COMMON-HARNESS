import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { authRateLimiter } from '../middleware/rate-limit';

const router = Router();

// ─── SSO Login (rate-limited — these are actual login attempts) ───
router.get('/google', authRateLimiter, authController.googleLogin);
router.get('/google/callback', authRateLimiter, authController.googleCallback);
router.get('/microsoft', authRateLimiter, authController.microsoftLogin);
router.get('/microsoft/callback', authRateLimiter, authController.microsoftCallback);

// ─── CSRF token (no rate limit — called on every state-changing request) ───
router.get('/csrf-token', authController.getCsrfToken);

// ─── Current user profile (no rate limit — called on every page load) ───
router.get('/me', authenticate, authController.getMe);

// ─── Token refresh (no rate limit — automatic background process) ───
router.post('/refresh', authController.refreshToken);

// ─── Logout (authenticated + CSRF) ───
router.post('/logout', authenticate, csrf, authController.logout);

export default router;
