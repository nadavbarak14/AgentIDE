import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { signToken, verifyToken } from '../../src/auth/jwt.js';

describe('JWT sign/verify', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const payload = {
    email: 'user@example.com',
    plan: 'pro',
    licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };

  it('signs a token and verifies it', async () => {
    const token = await signToken(payload, secret);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts

    const decoded = await verifyToken(token, secret);
    expect(decoded).toBeDefined();
    expect(decoded!.email).toBe('user@example.com');
    expect(decoded!.plan).toBe('pro');
    expect(decoded!.licenseExpiresAt).toBe(payload.licenseExpiresAt);
    expect(decoded!.iat).toBeDefined();
    expect(decoded!.exp).toBeDefined();
    expect(decoded!.exp).toBeGreaterThan(decoded!.iat);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken(payload, secret);
    const wrongSecret = crypto.randomBytes(32).toString('hex');
    const decoded = await verifyToken(token, wrongSecret);
    expect(decoded).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signToken(payload, secret);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const decoded = await verifyToken(tampered, secret);
    expect(decoded).toBeNull();
  });

  it('rejects garbage input', async () => {
    const decoded = await verifyToken('not.a.jwt', secret);
    expect(decoded).toBeNull();
  });

  it('rejects empty string', async () => {
    const decoded = await verifyToken('', secret);
    expect(decoded).toBeNull();
  });

  it('token expires after 30 days (exp claim is set)', async () => {
    const token = await signToken(payload, secret);
    const decoded = await verifyToken(token, secret);
    expect(decoded).toBeDefined();
    // exp should be ~30 days from iat
    const diffSeconds = decoded!.exp - decoded!.iat;
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(diffSeconds).toBeGreaterThanOrEqual(thirtyDays - 10);
    expect(diffSeconds).toBeLessThanOrEqual(thirtyDays + 10);
  });
});
