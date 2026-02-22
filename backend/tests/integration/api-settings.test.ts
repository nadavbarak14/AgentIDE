import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSettingsRouter } from '../../src/api/routes/settings.js';

describe('Settings API', () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDb();
    const repo = new Repository(db);
    app = express();
    app.use(express.json());
    app.use('/api/settings', createSettingsRouter(repo));
  });

  afterEach(() => {
    closeDb();
  });

  it('GET /api/settings returns default settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.maxVisibleSessions).toBe(4);
    expect(res.body.autoApprove).toBe(false);
    expect(res.body.gridLayout).toBe('auto');
    expect(res.body.theme).toBe('dark');
  });

  it('PATCH /api/settings updates partial settings', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ theme: 'light' });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe('light');
    expect(res.body.maxVisibleSessions).toBe(4); // unchanged
  });

  it('PATCH /api/settings updates maxVisibleSessions', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ maxVisibleSessions: 3 });
    expect(res.status).toBe(200);
    expect(res.body.maxVisibleSessions).toBe(3);
  });

  it('PATCH /api/settings rejects invalid gridLayout', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ gridLayout: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/settings rejects invalid theme', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ theme: 'neon' });
    expect(res.status).toBe(400);
  });
});
