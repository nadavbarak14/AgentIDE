import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createHooksRouter } from '../../src/api/routes/hooks.js';

describe('Hooks Route — Notification handler', () => {
  let app: express.Express;
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    repo.createLocalWorker('test-worker', 2);

    app = express();
    app.use(express.json());
    app.use('/', createHooksRouter(repo));
  });

  afterEach(() => {
    closeDb();
  });

  // Helper: create an active session and return its id
  function createActiveSession(): string {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'Test Session' });
    repo.activateSession(session.id, 12345);
    return session.id;
  }

  it('Notification with notificationType=permission_prompt sets needsInput=true, waitReason=permission', async () => {
    const sessionId = createActiveSession();

    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: sessionId, notificationType: 'permission_prompt' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(true);
    expect(session!.waitReason).toBe('permission');
  });

  it('Notification with notificationType=elicitation_dialog sets needsInput=true, waitReason=question', async () => {
    const sessionId = createActiveSession();

    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: sessionId, notificationType: 'elicitation_dialog' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(true);
    expect(session!.waitReason).toBe('question');
  });

  it('Notification with notificationType=auth_success is ignored (no state change)', async () => {
    const sessionId = createActiveSession();

    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: sessionId, notificationType: 'auth_success' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(false);
    expect(session!.waitReason).toBeNull();
  });

  it('Notification with notificationType=idle_prompt is ignored (no state change)', async () => {
    const sessionId = createActiveSession();

    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: sessionId, notificationType: 'idle_prompt' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(false);
    expect(session!.waitReason).toBeNull();
  });

  it('Stop event sets needsInput=true, waitReason=stopped', async () => {
    const sessionId = createActiveSession();

    const res = await request(app)
      .post('/event')
      .send({ event: 'Stop', c3SessionId: sessionId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(true);
    expect(session!.waitReason).toBe('stopped');
  });

  it('duplicate Notification events are idempotent', async () => {
    const sessionId = createActiveSession();

    const payload = { event: 'Notification', c3SessionId: sessionId, notificationType: 'permission_prompt' };

    const res1 = await request(app).post('/event').send(payload);
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/event').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(true);
    expect(session!.waitReason).toBe('permission');
  });

  it('Notification for unknown session returns 404', async () => {
    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: 'nonexistent-id', notificationType: 'permission_prompt' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Session not found' });
  });

  it('Notification for completed session is ignored (no state change, returns 200)', async () => {
    const sessionId = createActiveSession();
    repo.completeSession(sessionId, null);

    const res = await request(app)
      .post('/event')
      .send({ event: 'Notification', c3SessionId: sessionId, notificationType: 'permission_prompt' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const session = repo.getSession(sessionId);
    expect(session!.needsInput).toBe(false);
    expect(session!.waitReason).toBeNull();
  });
});
