import type { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';
import type { Repository } from '../models/repository.js';
import { validateCookieValue, isLocalhostIp } from '../services/auth-service.js';

// Request logging
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info({ method: req.method, url: req.url }, 'incoming request');
  next();
}

// JSON error handler
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}

// Validate UUID parameter
export function validateUuid(paramName: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(req.params[paramName] || '');
    if (!value || !uuidRegex.test(value)) {
      res.status(400).json({ error: `Invalid ${paramName}: must be a valid UUID` });
      return;
    }
    next();
  };
}

// Validate required body fields
export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'Request body must be a JSON object' });
      return;
    }
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }
    next();
  };
}

// Sanitize file paths to prevent directory traversal
export function sanitizePath(inputPath: string): string | null {
  // Reject any path containing ..
  if (inputPath.includes('..')) return null;
  // Reject null bytes
  if (inputPath.includes('\0')) return null;
  return inputPath;
}

/**
 * Auth middleware — validates auth cookie for non-localhost requests.
 * Bypasses auth for localhost requests.
 */
export function requireAuth(repo: Repository) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Localhost bypass — always allow
    const ip = req.ip || req.socket?.remoteAddress;
    if (isLocalhostIp(ip)) {
      next();
      return;
    }

    // Check auth cookie
    const authCookie = req.cookies?.adyx_auth;
    if (!authCookie) {
      // No cookie — redirect HTML requests to login, return 401 for API
      if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Authentication required' });
      } else {
        res.redirect('/login');
      }
      return;
    }

    // Validate cookie
    const authConfig = repo.getAuthConfig();
    if (!authConfig) {
      // No auth configured — fail closed for non-localhost
      if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Authentication required' });
      } else {
        res.redirect('/login');
      }
      return;
    }

    if (validateCookieValue(authCookie, authConfig.cookieSecret)) {
      next();
    } else {
      // Invalid/expired cookie
      res.clearCookie('adyx_auth', { path: '/' });
      if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Invalid or expired session' });
      } else {
        res.redirect('/login');
      }
    }
  };
}
