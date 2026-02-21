/**
 * Test helper: generate license keys using the dev private key.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Use the dev private key bundled as a test fixture (matches the public key in license.ts)
const PRIVATE_KEY_PATH = path.join(import.meta.dirname, 'dev-private.pem');

let privateKey: string | null = null;

function getPrivateKey(): string {
  if (!privateKey) {
    if (!fs.existsSync(PRIVATE_KEY_PATH)) {
      throw new Error(
        `Dev private key not found at ${PRIVATE_KEY_PATH}. Run: npx tsx tools/generate-license.ts --generate-keys`,
      );
    }
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
  }
  return privateKey;
}

export function generateTestLicenseKey(payload: {
  email: string;
  plan: string;
  maxSessions: number;
  expiresAt: string;
  issuedAt?: string;
}): string {
  const fullPayload = {
    ...payload,
    issuedAt: payload.issuedAt || new Date().toISOString(),
  };

  const payloadJson = JSON.stringify(fullPayload);
  const payloadB64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadB64);
  sign.end();
  const signature = sign.sign(
    { key: getPrivateKey(), padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
  );
  const signatureB64 = signature.toString('base64url');

  return `${payloadB64}.${signatureB64}`;
}
