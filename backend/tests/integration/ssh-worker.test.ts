import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { WorkerManager } from '../../src/services/worker-manager.js';
import { createWorkersRouter } from '../../src/api/routes/workers.js';

// Test SSH key fixtures
const TEST_DIR = path.join(os.tmpdir(), 'agentide-ssh-test-' + process.pid);

function createTestKey(filename: string, content: string): string {
  const filePath = path.join(TEST_DIR, filename);
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  return filePath;
}

// Valid unencrypted RSA private key (minimal PEM format for testing)
const VALID_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJRGo1OAAL+P4gzTx3MFKLK1xXn
mBJMOrYJIBRlUqXbJYWXIBR7/cFLB3ST+HcCAwEAAQJAO5Q0M5d/WRa+kkJOB8y4
T3MfXCn8EPHpqBnguV8W2kkGxRjJvI/fBEbJPKXlq5DZLf+dhtNmMUB85vFAx3FW
AQIhAOB9MNqNEYkOr4VY1OHYXE7TCQp8LyaxFbPLy6Z3T2VHAiEA0BY59sT+OJGB
FkvDjNOpMoIcjyXqm/HxwGnJbM4KfUECIBUE7lBR6ltoXkDLl57MZbO6Y7OI2Ij/
FuFRoG4H8sz3AiEAywPpYy5R5j0p/YEo17SuhCFhFn7LS5IDqzWbvJkViAECIGjy
WB3Am3BgyN/nxLALuOH0pQrSvFPaFnMFELHJYoRj
-----END RSA PRIVATE KEY-----`;

// Encrypted (passphrase-protected) RSA private key
const ENCRYPTED_KEY = `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-128-CBC,1234567890ABCDEF

MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJRGo1OAAL+P4gzTx3MFKLK1xXn
mBJMOrYJIBRlUqXbJYWXIBR7/cFLB3ST+HcCAwEAAQJAO5Q0M5d/WRa+kkJOB8y4
-----END RSA PRIVATE KEY-----`;

// Newer PKCS#8 encrypted format
const ENCRYPTED_PKCS8_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJRGo1OAAL+P4gzTx3MFKLK1xXn
-----END ENCRYPTED PRIVATE KEY-----`;

// Not a private key at all
const NOT_A_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
-----END PUBLIC KEY-----`;

describe('SSH Worker Validation', () => {
  let app: express.Express;
  let workerManager: WorkerManager;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });

    const db = createTestDb();
    const repo = new Repository(db);
    workerManager = new WorkerManager(repo);
    app = express();
    app.use(express.json());
    app.use('/api/workers', createWorkersRouter(repo, workerManager));
  });

  afterEach(() => {
    workerManager.destroy();
    closeDb();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('validateSshKeyFile', () => {
    it('accepts a valid unencrypted private key', () => {
      const keyPath = createTestKey('valid.pem', VALID_KEY);
      expect(() => workerManager.validateSshKeyFile(keyPath)).not.toThrow();
    });

    it('rejects a non-existent key file', () => {
      expect(() => workerManager.validateSshKeyFile('/nonexistent/path/key.pem'))
        .toThrow('SSH key file not found');
    });

    it('rejects a passphrase-protected key (PEM format)', () => {
      const keyPath = createTestKey('encrypted.pem', ENCRYPTED_KEY);
      expect(() => workerManager.validateSshKeyFile(keyPath))
        .toThrow('passphrase-protected');
    });

    it('rejects a passphrase-protected key (PKCS#8 format)', () => {
      const keyPath = createTestKey('encrypted-pkcs8.pem', ENCRYPTED_PKCS8_KEY);
      expect(() => workerManager.validateSshKeyFile(keyPath))
        .toThrow('passphrase-protected');
    });

    it('rejects a file that is not a private key', () => {
      const keyPath = createTestKey('public.pem', NOT_A_KEY);
      expect(() => workerManager.validateSshKeyFile(keyPath))
        .toThrow('does not appear to be a private key');
    });

    it('rejects an unreadable file', () => {
      const keyPath = createTestKey('unreadable.pem', VALID_KEY);
      fs.chmodSync(keyPath, 0o000);
      expect(() => workerManager.validateSshKeyFile(keyPath))
        .toThrow('not readable');
      // Restore permissions for cleanup
      fs.chmodSync(keyPath, 0o600);
    });
  });

  describe('POST /api/workers validation', () => {
    it('returns 400 for non-existent key file', async () => {
      const res = await request(app)
        .post('/api/workers')
        .send({
          name: 'test-worker',
          sshHost: '192.168.1.100',
          sshUser: 'ubuntu',
          sshKeyPath: '/nonexistent/key.pem',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('SSH key file not found');
    });

    it('returns 400 for passphrase-protected key', async () => {
      const keyPath = createTestKey('encrypted.pem', ENCRYPTED_KEY);
      const res = await request(app)
        .post('/api/workers')
        .send({
          name: 'test-worker',
          sshHost: '192.168.1.100',
          sshUser: 'ubuntu',
          sshKeyPath: keyPath,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('passphrase-protected');
    });

    it('returns 400 for a file that is not a private key', async () => {
      const keyPath = createTestKey('public.pem', NOT_A_KEY);
      const res = await request(app)
        .post('/api/workers')
        .send({
          name: 'test-worker',
          sshHost: '192.168.1.100',
          sshUser: 'ubuntu',
          sshKeyPath: keyPath,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not appear to be a private key');
    });
  });
});
