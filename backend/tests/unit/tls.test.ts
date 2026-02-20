import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadTlsConfig, generateSelfSignedCert } from '../../src/auth/tls.js';

describe('TLS', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadTlsConfig', () => {
    it('loads cert and key from disk', () => {
      const certPath = path.join(tmpDir, 'cert.pem');
      const keyPath = path.join(tmpDir, 'key.pem');
      fs.writeFileSync(certPath, 'CERT_DATA');
      fs.writeFileSync(keyPath, 'KEY_DATA');

      const config = loadTlsConfig(certPath, keyPath);
      expect(config.cert).toBe('CERT_DATA');
      expect(config.key).toBe('KEY_DATA');
    });

    it('throws if cert file does not exist', () => {
      const keyPath = path.join(tmpDir, 'key.pem');
      fs.writeFileSync(keyPath, 'KEY_DATA');

      expect(() => loadTlsConfig('/nonexistent/cert.pem', keyPath)).toThrow('TLS certificate not found');
    });

    it('throws if key file does not exist', () => {
      const certPath = path.join(tmpDir, 'cert.pem');
      fs.writeFileSync(certPath, 'CERT_DATA');

      expect(() => loadTlsConfig(certPath, '/nonexistent/key.pem')).toThrow('TLS key not found');
    });
  });

  describe('generateSelfSignedCert', () => {
    it('generates a self-signed cert with valid PEM format', async () => {
      const origHome = process.env.HOME;
      process.env.HOME = tmpDir;
      try {
        const config = await generateSelfSignedCert();
        expect(config.cert).toContain('-----BEGIN CERTIFICATE-----');
        expect(config.key).toContain('-----BEGIN PRIVATE KEY-----');

        // Verify files were written
        const tlsDir = path.join(tmpDir, '.agentide', 'tls');
        expect(fs.existsSync(path.join(tlsDir, 'cert.pem'))).toBe(true);
        expect(fs.existsSync(path.join(tlsDir, 'key.pem'))).toBe(true);
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('reuses existing cert on second call', async () => {
      const origHome = process.env.HOME;
      process.env.HOME = tmpDir;
      try {
        const config1 = await generateSelfSignedCert();
        const config2 = await generateSelfSignedCert();
        expect(config1.cert).toBe(config2.cert);
        expect(config1.key).toBe(config2.key);
      } finally {
        process.env.HOME = origHome;
      }
    });
  });
});
