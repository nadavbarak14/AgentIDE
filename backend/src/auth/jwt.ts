import * as jose from 'jose';
import type { Response } from 'express';
import type { JwtPayload } from '../models/types.js';

const COOKIE_NAME = 'agentide_session';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Sign a JWT token using HMAC-SHA256 with 30-day expiry.
 */
export async function signToken(
  payload: { email: string; plan: string; licenseExpiresAt: string },
  secret: string,
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey);
  return token;
}

/**
 * Verify and decode a JWT token.
 * Returns decoded payload or null if invalid/expired.
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Set the auth session cookie on a response.
 */
export function setAuthCookie(res: Response, token: string, isHttps: boolean): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000, // Express uses milliseconds
  });
}

/**
 * Clear the auth session cookie.
 */
export function clearAuthCookie(res: Response): void {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export { COOKIE_NAME };
