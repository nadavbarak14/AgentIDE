import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  generateAccessKey,
  hashKey,
  verifyKey,
  createCookieValue,
  validateCookieValue,
  generateCookieSecret,
  isLocalhostIp,
} from '../../src/services/auth-service.js';

// ---------------------------------------------------------------------------
// generateAccessKey
// ---------------------------------------------------------------------------
describe('Auth Service', () => {
  describe('generateAccessKey', () => {
    it('returns a base64url string of at least 43 characters', () => {
      const key = generateAccessKey();
      expect(key.length).toBeGreaterThanOrEqual(43);
      // base64url: only [A-Za-z0-9_-]
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique keys on each call', () => {
      const key1 = generateAccessKey();
      const key2 = generateAccessKey();
      expect(key1).not.toBe(key2);
    });
  });

  // ---------------------------------------------------------------------------
  // hashKey / verifyKey
  // ---------------------------------------------------------------------------
  describe('hashKey / verifyKey', () => {
    it('hashKey returns salt:hash format', () => {
      const key = generateAccessKey();
      const hash = hashKey(key);
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
      // salt = 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // hash = 64 bytes = 128 hex chars
      expect(parts[1]).toHaveLength(128);
    });

    it('verifyKey returns true for correct key', () => {
      const key = generateAccessKey();
      const hash = hashKey(key);
      expect(verifyKey(key, hash)).toBe(true);
    });

    it('verifyKey returns false for wrong key', () => {
      const key = generateAccessKey();
      const hash = hashKey(key);
      expect(verifyKey('wrong-key', hash)).toBe(false);
    });

    it('verifyKey returns false for malformed hash', () => {
      expect(verifyKey('any-key', 'not-a-valid-hash')).toBe(false);
    });

    it('verifyKey returns false for empty hash parts', () => {
      expect(verifyKey('any-key', ':')).toBe(false);
    });

    it('produces different hashes for same key (random salt)', () => {
      const key = generateAccessKey();
      const hash1 = hashKey(key);
      const hash2 = hashKey(key);
      expect(hash1).not.toBe(hash2);
      // But both should verify
      expect(verifyKey(key, hash1)).toBe(true);
      expect(verifyKey(key, hash2)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createCookieValue / validateCookieValue
  // ---------------------------------------------------------------------------
  describe('createCookieValue / validateCookieValue', () => {
    const secret = generateCookieSecret();

    it('createCookieValue returns payload.hmac format', () => {
      const cookie = createCookieValue(secret);
      const parts = cookie.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('validateCookieValue accepts valid cookie', () => {
      const cookie = createCookieValue(secret);
      expect(validateCookieValue(cookie, secret)).toBe(true);
    });

    it('validateCookieValue rejects cookie with wrong secret', () => {
      const cookie = createCookieValue(secret);
      expect(validateCookieValue(cookie, 'wrong-secret')).toBe(false);
    });

    it('validateCookieValue rejects tampered payload', () => {
      const cookie = createCookieValue(secret);
      const [, hmac] = cookie.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        authenticated: true,
        issuedAt: Date.now() + 999999,
      })).toString('base64url');
      expect(validateCookieValue(`${tamperedPayload}.${hmac}`, secret)).toBe(false);
    });

    it('validateCookieValue rejects expired cookie', () => {
      const payload = JSON.stringify({
        authenticated: true,
        issuedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      });
      const payloadB64 = Buffer.from(payload).toString('base64url');
      const hmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
      expect(validateCookieValue(`${payloadB64}.${hmac}`, secret, 30)).toBe(false);
    });

    it('validateCookieValue rejects malformed cookie', () => {
      expect(validateCookieValue('not-a-cookie', secret)).toBe(false);
      expect(validateCookieValue('', secret)).toBe(false);
      expect(validateCookieValue('a.b.c', secret)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // generateCookieSecret
  // ---------------------------------------------------------------------------
  describe('generateCookieSecret', () => {
    it('returns a 64-character hex string', () => {
      const secret = generateCookieSecret();
      expect(secret).toHaveLength(64);
      expect(secret).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique secrets', () => {
      const s1 = generateCookieSecret();
      const s2 = generateCookieSecret();
      expect(s1).not.toBe(s2);
    });
  });

  // ---------------------------------------------------------------------------
  // isLocalhostIp
  // ---------------------------------------------------------------------------
  describe('isLocalhostIp', () => {
    it('returns true for 127.0.0.1', () => {
      expect(isLocalhostIp('127.0.0.1')).toBe(true);
    });

    it('returns true for ::1', () => {
      expect(isLocalhostIp('::1')).toBe(true);
    });

    it('returns true for ::ffff:127.0.0.1', () => {
      expect(isLocalhostIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('returns false for external IP', () => {
      expect(isLocalhostIp('192.168.1.1')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isLocalhostIp(undefined)).toBe(false);
    });
  });
});
