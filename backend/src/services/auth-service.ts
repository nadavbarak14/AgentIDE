import * as crypto from 'node:crypto';

/**
 * Generate a cryptographically random access key.
 * Returns a base64url-encoded string (43+ characters, 256 bits of entropy).
 */
export function generateAccessKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash an access key using scrypt with a random salt.
 * Returns format: "salt-hex:hash-hex"
 */
export function hashKey(key: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(key, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify an access key against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyKey(key: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expectedHash = Buffer.from(hashHex, 'hex');
  const actualHash = crypto.scryptSync(key, salt, 64);
  return crypto.timingSafeEqual(expectedHash, actualHash);
}

/**
 * Create a signed cookie value for authenticated sessions.
 * Format: base64-payload.hmac-signature
 */
export function createCookieValue(cookieSecret: string): string {
  const payload = JSON.stringify({
    authenticated: true,
    issuedAt: Date.now(),
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', cookieSecret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Validate a signed cookie value.
 * Checks HMAC signature and that issuedAt is within maxAgeDays.
 */
export function validateCookieValue(
  cookie: string,
  cookieSecret: string,
  maxAgeDays = 30
): boolean {
  const parts = cookie.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  // Verify HMAC
  const expectedHmac = crypto
    .createHmac('sha256', cookieSecret)
    .update(payloadB64)
    .digest('base64url');

  // Timing-safe comparison for HMAC
  const sigBuf = Buffer.from(signature, 'base64url');
  const expectedBuf = Buffer.from(expectedHmac, 'base64url');
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  // Parse and check expiry
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload.authenticated || !payload.issuedAt) return false;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.issuedAt > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random cookie signing secret.
 * Returns hex-encoded string (64 chars = 32 bytes).
 */
export function generateCookieSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if a request IP is from localhost.
 */
export function isLocalhostIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
