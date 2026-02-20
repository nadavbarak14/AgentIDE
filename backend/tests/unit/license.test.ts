import { describe, it, expect } from 'vitest';
import { validateLicense, hashLicenseKey } from '../../src/auth/license.js';
import { generateTestLicenseKey } from '../helpers/license-helper.js';

describe('License Validation', () => {
  it('validates a correctly signed license key', () => {
    const key = generateTestLicenseKey({
      email: 'user@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = validateLicense(key);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.email).toBe('user@example.com');
    expect(result.payload!.plan).toBe('pro');
    expect(result.payload!.maxSessions).toBe(10);
  });

  it('rejects a tampered payload', () => {
    const key = generateTestLicenseKey({
      email: 'user@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Tamper with the payload (change a character)
    const [_payload, signature] = key.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ email: 'hacker@evil.com', plan: 'enterprise', maxSessions: 999, expiresAt: '2099-01-01T00:00:00.000Z', issuedAt: new Date().toISOString() }),
      'utf-8',
    ).toString('base64url');

    const result = validateLicense(`${tamperedPayload}.${signature}`);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature verification failed');
  });

  it('rejects an expired license key', () => {
    const key = generateTestLicenseKey({
      email: 'user@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
    });

    const result = validateLicense(key);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
    // Payload should still be available for error messages
    expect(result.payload).toBeDefined();
    expect(result.payload!.email).toBe('user@example.com');
  });

  it('rejects garbage input', () => {
    const result = validateLicense('not-a-valid-key');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects empty input', () => {
    const result = validateLicense('');
    expect(result.valid).toBe(false);
  });

  it('rejects key with valid format but invalid signature', () => {
    const fakePayload = Buffer.from(
      JSON.stringify({ email: 'a@b.com', plan: 'free', maxSessions: 1, expiresAt: '2099-01-01T00:00:00.000Z', issuedAt: '2026-01-01T00:00:00.000Z' }),
    ).toString('base64url');
    const fakeSignature = Buffer.from('invalid-signature-data').toString('base64url');

    const result = validateLicense(`${fakePayload}.${fakeSignature}`);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature verification failed');
  });
});

describe('hashLicenseKey', () => {
  it('produces consistent SHA-256 hash', () => {
    const key = 'test-license-key';
    const hash1 = hashLicenseKey(key);
    const hash2 = hashLicenseKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('produces different hashes for different keys', () => {
    expect(hashLicenseKey('key-a')).not.toBe(hashLicenseKey('key-b'));
  });
});
