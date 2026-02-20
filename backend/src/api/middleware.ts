import type { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';
import { verifyToken, COOKIE_NAME } from '../auth/jwt.js';

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

// Auth middleware — skip auth when authRequired=false (localhost mode)
export function createAuthMiddleware(jwtSecret: string, authRequired: boolean) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!authRequired) {
      next();
      return;
    }

    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = await verifyToken(token, jwtSecret);
    if (!payload) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check if license has expired since JWT was issued
    if (payload.licenseExpiresAt && new Date(payload.licenseExpiresAt).getTime() < Date.now()) {
      res.status(401).json({ error: 'License expired' });
      return;
    }

    // Attach auth payload to request for downstream use
    (req as Request & { auth?: typeof payload }).auth = payload;
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
