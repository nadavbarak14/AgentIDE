import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Repository } from '../../models/repository.js';
import { validateLicense, hashLicenseKey } from '../../auth/license.js';
import { signToken, setAuthCookie, clearAuthCookie, verifyToken, COOKIE_NAME } from '../../auth/jwt.js';
import { logger } from '../../services/logger.js';

export function createAuthRouter(repo: Repository, authRequired: boolean, isHttps = false): Router {
  const router = Router();

  // Rate limit: 5 failed attempts per IP per 15 minutes
  const activateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again later.', retryAfter: 900 },
  });

  // POST /api/auth/activate — validate license key, set JWT cookie
  router.post('/activate', activateLimiter, async (req, res) => {
    const { licenseKey } = req.body || {};
    if (!licenseKey || typeof licenseKey !== 'string') {
      res.status(400).json({ error: 'Missing required field: licenseKey' });
      return;
    }

    const result = validateLicense(licenseKey);
    if (!result.valid || !result.payload) {
      const status = result.error?.includes('expired') ? 403 : 401;
      logger.warn({ error: result.error }, 'license activation failed');
      res.status(status).json({
        error: result.error || 'Invalid license key',
        ...(result.payload?.expiresAt ? { expiresAt: result.payload.expiresAt } : {}),
      });
      return;
    }

    const { payload } = result;

    // Store license metadata in database
    repo.updateAuthConfig({
      licenseKeyHash: hashLicenseKey(licenseKey),
      licenseEmail: payload.email,
      licensePlan: payload.plan,
      licenseMaxSessions: payload.maxSessions,
      licenseExpiresAt: payload.expiresAt,
      licenseIssuedAt: payload.issuedAt,
    });

    // Sign JWT and set cookie
    const authConfig = repo.getAuthConfig();
    const token = await signToken(
      {
        email: payload.email,
        plan: payload.plan,
        licenseExpiresAt: payload.expiresAt,
      },
      authConfig.jwtSecret,
    );
    setAuthCookie(res, token, isHttps);

    logger.info({ email: payload.email, plan: payload.plan }, 'license activated');

    res.json({
      email: payload.email,
      plan: payload.plan,
      maxSessions: payload.maxSessions,
      expiresAt: payload.expiresAt,
    });
  });

  // GET /api/auth/status — check auth state (never returns 401)
  router.get('/status', async (req, res) => {
    if (!authRequired) {
      res.json({
        authRequired: false,
        authenticated: true,
        email: null,
        plan: null,
        licenseExpiresAt: null,
      });
      return;
    }

    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.json({
        authRequired: true,
        authenticated: false,
        email: null,
        plan: null,
        licenseExpiresAt: null,
      });
      return;
    }

    const authConfig = repo.getAuthConfig();
    const payload = await verifyToken(token, authConfig.jwtSecret);
    if (!payload) {
      res.json({
        authRequired: true,
        authenticated: false,
        email: null,
        plan: null,
        licenseExpiresAt: null,
      });
      return;
    }

    res.json({
      authRequired: true,
      authenticated: true,
      email: payload.email,
      plan: payload.plan,
      licenseExpiresAt: payload.licenseExpiresAt,
    });
  });

  // POST /api/auth/logout — clear session cookie
  router.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  return router;
}
