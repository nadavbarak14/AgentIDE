import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LicensePayload } from '../models/types.js';

// RSA public key for license validation (embedded — never changes at runtime)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0zqHNGJs/rUx2e5yWJS9
MwVtpZk6D2Z22lxn65Z70jmyjjMNH6TSSY6iClyC+1qcFoSYBjNYAqeGTGVEhTK2
zylWB/pL1tYL9D4RRm5ODqViH8Zhbnh+5JzMhsCTLol2GSmdhvSj8iTmkTVvONh2
n4rcYWnpNghpFOq+MCC8lgY6tgzMpwgoJpsVoIqmpDDX4YRWJpRTGJLMdh4EhE1s
D/ec4trGJ8c8RncaA/1YZnAb6TS99Q4kywvjETLn2zmiySGvYsRbvrzZ2oyBIQtV
J/aPAQfIFc6QJbS3xhIUNtSZwYtw9e7vN7guS+VETAUfl8wosaz+IKGig3yq610j
XwIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.agentide',
);
const LICENSE_FILE = path.join(LICENSE_DIR, 'license.key');

export interface LicenseValidationResult {
  valid: boolean;
  payload?: LicensePayload;
  error?: string;
}

/**
 * Validate a license key string.
 * Format: base64url(JSON payload) + "." + base64url(RSA-PSS-SHA256 signature)
 */
export function validateLicense(licenseKey: string): LicenseValidationResult {
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid license key format' };
  }

  const [payloadB64, signatureB64] = parts;

  // Verify RSA-PSS signature
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(payloadB64);
    verify.end();
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');
    const isValid = verify.verify(
      { key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      signatureBuffer,
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid license key: signature verification failed' };
    }
  } catch {
    return { valid: false, error: 'Invalid license key: signature verification failed' };
  }

  // Decode and parse payload
  let payload: LicensePayload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    payload = JSON.parse(payloadJson) as LicensePayload;
  } catch {
    return { valid: false, error: 'Invalid license key: malformed payload' };
  }

  // Validate required fields
  if (!payload.email || !payload.plan || !payload.expiresAt || !payload.issuedAt) {
    return { valid: false, error: 'Invalid license key: missing required fields' };
  }

  // Check expiry
  const expiresAt = new Date(payload.expiresAt);
  if (isNaN(expiresAt.getTime())) {
    return { valid: false, error: 'Invalid license key: invalid expiry date' };
  }
  if (expiresAt.getTime() < Date.now()) {
    return { valid: false, error: 'License key expired', payload };
  }

  return { valid: true, payload };
}

/**
 * Compute SHA-256 hash of a license key (for storage/comparison).
 */
export function hashLicenseKey(licenseKey: string): string {
  return crypto.createHash('sha256').update(licenseKey.trim()).digest('hex');
}

/**
 * Load license key from disk (~/.agentide/license.key).
 * Returns null if file doesn't exist.
 */
export function loadLicenseFromDisk(): string | null {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    return fs.readFileSync(LICENSE_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Save license key to disk with restricted permissions (owner-only read/write).
 */
export function saveLicenseToDisk(licenseKey: string): void {
  if (!fs.existsSync(LICENSE_DIR)) {
    fs.mkdirSync(LICENSE_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(LICENSE_FILE, licenseKey.trim(), { mode: 0o600 });
}

// Export for testing
export { PUBLIC_KEY as _PUBLIC_KEY_FOR_TESTING };
