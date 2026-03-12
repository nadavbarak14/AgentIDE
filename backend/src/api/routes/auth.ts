import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import { verifyKey, createCookieValue, validateCookieValue, isLocalhostIp } from '../../services/auth-service.js';
import { logger } from '../../services/logger.js';
export function createAuthRouter(repo: Repository): Router {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', (req, res) => {
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
      logger.warn({ ip: req.ip }, 'Failed login attempt');
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

    logger.info({ ip: req.ip }, 'Successful login');
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
  router.post('/logout', (_req, res) => {
    res.clearCookie('adyx_auth', { path: '/' });
    res.json({ authenticated: false });
  });

  return router;
}
