import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Repository } from '../../models/repository.js';
import { verifyKey, createCookieValue, validateCookieValue, isLocalhostIp } from '../../services/auth-service.js';
import { logger } from '../../services/logger.js';

// Rate limiter for login endpoint: 5 failed attempts per IP per 15-minute window
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.', retryAfter: 900 },
});

export function createAuthRouter(repo: Repository): Router {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', loginLimiter, (req, res) => {
    const sourceIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const { accessKey } = req.body as { accessKey?: string };
    if (!accessKey) {
      res.status(400).json({ error: 'Missing accessKey' });
      return;
    }

    const authConfig = repo.getAuthConfig();
    if (!authConfig) {
      res.status(500).json({ error: 'Authentication not configured' });
      return;
    }

    if (!verifyKey(accessKey, authConfig.keyHash)) {
      logger.warn({ ip: sourceIp }, 'Failed login attempt');
      repo.logAuthEvent('login_failure', sourceIp, 'Invalid access key');
      res.status(401).json({ error: 'Invalid access key' });
      return;
    }

    // Valid key — set auth cookie
    const cookieValue = createCookieValue(authConfig.cookieSecret);
    res.cookie('adyx_auth', cookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    logger.info({ ip: sourceIp }, 'Successful login');
    repo.logAuthEvent('login_success', sourceIp);
    res.json({ authenticated: true });
  });

  // GET /api/auth/status
  router.get('/status', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress;
    const isLocal = isLocalhostIp(ip);

    if (isLocal) {
      res.json({ authenticated: true, isLocalhost: true });
      return;
    }

    const authCookie = req.cookies?.adyx_auth;
    const authConfig = repo.getAuthConfig();

    if (!authConfig || !authCookie || !validateCookieValue(authCookie, authConfig.cookieSecret)) {
      res.status(401).json({ authenticated: false });
      return;
    }

    // Parse cookie payload for expiry info
    try {
      const [payloadB64] = authCookie.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      const expiresAt = new Date(payload.issuedAt + 30 * 24 * 60 * 60 * 1000).toISOString();
      res.json({ authenticated: true, isLocalhost: false, expiresAt });
    } catch {
      res.json({ authenticated: true, isLocalhost: false });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    const sourceIp = req.ip || req.socket?.remoteAddress || 'unknown';
    repo.logAuthEvent('logout', sourceIp);
    res.clearCookie('adyx_auth', { path: '/' });
    res.json({ authenticated: false });
  });

  // GET /api/auth/audit-log (requires authentication — checked in handler since auth router is before requireAuth middleware)
  router.get('/audit-log', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress;
    const isLocal = isLocalhostIp(ip);

    // Require authentication for non-localhost
    if (!isLocal) {
      const authCookie = req.cookies?.adyx_auth;
      const authConfig = repo.getAuthConfig();
      if (!authConfig || !authCookie || !validateCookieValue(authCookie, authConfig.cookieSecret)) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
    }

    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = Math.min(Math.max(limitParam || 50, 1), 500);
    const entries = repo.getAuthAuditLog(limit);
    res.json({ entries });
  });

  return router;
}
