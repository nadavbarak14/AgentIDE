import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { logger } from '../services/logger.js';

function getTlsDir(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.agentide',
    'tls',
  );
}

export interface TlsConfig {
  cert: string;
  key: string;
}

/**
 * Load TLS cert and key from disk paths.
 */
export function loadTlsConfig(certPath: string, keyPath: string): TlsConfig {
  if (!fs.existsSync(certPath)) {
    throw new Error(`TLS certificate not found: ${certPath}`);
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`TLS key not found: ${keyPath}`);
  }
  return {
    cert: fs.readFileSync(certPath, 'utf-8'),
    key: fs.readFileSync(keyPath, 'utf-8'),
  };
}

/**
 * Generate a self-signed TLS certificate and store in ~/.agentide/tls/.
 * Reuses existing cert if found.
 */
export async function generateSelfSignedCert(): Promise<TlsConfig> {
  const tlsDir = getTlsDir();
  const certPath = path.join(tlsDir, 'cert.pem');
  const keyPath = path.join(tlsDir, 'key.pem');

  // Reuse existing cert if it exists
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    logger.info({ certPath }, 'Reusing existing self-signed certificate');
    return {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
    };
  }

  // Generate new self-signed cert (async in selfsigned v5)
  const attrs = [{ name: 'commonName', value: 'AgentIDE Self-Signed' }];
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
  });

  // Save to disk
  if (!fs.existsSync(tlsDir)) {
    fs.mkdirSync(tlsDir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(certPath, pems.cert, { mode: 0o600 });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });

  logger.info({ certPath }, 'Self-signed TLS certificate generated');

  return {
    cert: pems.cert,
    key: pems.private,
  };
}
