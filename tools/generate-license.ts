#!/usr/bin/env npx tsx
/**
 * Developer-only license key generator.
 * Generates RSA-2048 keypair (if not already present) and signs license payloads.
 *
 * Usage:
 *   npx tsx tools/generate-license.ts --email user@example.com --plan pro --expires 2027-01-01
 *   npx tsx tools/generate-license.ts --generate-keys   # generate keypair only
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEYS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.adyx',
);
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

function ensureKeysDir(): void {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  }
}

function generateKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function saveKeys(publicKey: string, privateKey: string): void {
  ensureKeysDir();
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
  console.log(`Private key: ${PRIVATE_KEY_PATH}`);
  console.log(`Public key:  ${PUBLIC_KEY_PATH}`);
}

function loadPrivateKey(): string {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.log('No keypair found. Generating new RSA-2048 keypair...');
    const keys = generateKeypair();
    saveKeys(keys.publicKey, keys.privateKey);
    return keys.privateKey;
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
}

function base64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

function signLicense(payload: {
  email: string;
  plan: string;
  maxSessions: number;
  expiresAt: string;
  issuedAt: string;
}): string {
  const privateKey = loadPrivateKey();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(Buffer.from(payloadJson, 'utf-8'));

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadB64);
  sign.end();
  const signature = sign.sign(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
  );
  const signatureB64 = base64urlEncode(signature);

  return `${payloadB64}.${signatureB64}`;
}

// Parse CLI args
const args = process.argv.slice(2);

if (args.includes('--generate-keys')) {
  const keys = generateKeypair();
  saveKeys(keys.publicKey, keys.privateKey);
  console.log('\nKeypair generated. Copy the public key into backend/src/auth/license.ts');
  console.log('\nPublic key contents:');
  console.log(fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8'));
  process.exit(0);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const email = getArg('--email');
const plan = getArg('--plan') || 'pro';
const maxSessions = parseInt(getArg('--max-sessions') || '10', 10);
const expiresAt = getArg('--expires');

if (!email) {
  console.error('Usage: npx tsx tools/generate-license.ts --email <email> [--plan <plan>] [--max-sessions <n>] [--expires <YYYY-MM-DD>]');
  console.error('       npx tsx tools/generate-license.ts --generate-keys');
  process.exit(1);
}

const expiresDate = expiresAt
  ? new Date(expiresAt).toISOString()
  : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year default

const payload = {
  email,
  plan,
  maxSessions,
  expiresAt: expiresDate,
  issuedAt: new Date().toISOString(),
};

const licenseKey = signLicense(payload);

console.log('\nLicense Key Generated:');
console.log('─'.repeat(60));
console.log(licenseKey);
console.log('─'.repeat(60));
console.log(`\nEmail:        ${payload.email}`);
console.log(`Plan:         ${payload.plan}`);
console.log(`Max Sessions: ${payload.maxSessions}`);
console.log(`Expires:      ${payload.expiresAt}`);
console.log(`Issued:       ${payload.issuedAt}`);

// Also output the public key for embedding
if (fs.existsSync(PUBLIC_KEY_PATH)) {
  console.log('\nPublic key for embedding (backend/src/auth/license.ts):');
  console.log(fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8'));
}
