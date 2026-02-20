import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Uploaded Images Repository', () => {
  let repo: Repository;
  let sessionId: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'Test' });
    sessionId = session.id;
  });

  afterEach(() => {
    closeDb();
  });

  // ─── Create ───

  it('creates an uploaded image with all fields', () => {
    const image = repo.createUploadedImage({
      sessionId,
      originalFilename: 'screenshot.png',
      storedPath: '/uploads/abc123.png',
      mimeType: 'image/png',
      fileSize: 204800,
      width: 1920,
      height: 1080,
      compressed: true,
    });

    expect(image.id).toBeTruthy();
    expect(image.sessionId).toBe(sessionId);
    expect(image.originalFilename).toBe('screenshot.png');
    expect(image.storedPath).toBe('/uploads/abc123.png');
    expect(image.mimeType).toBe('image/png');
    expect(image.fileSize).toBe(204800);
    expect(image.width).toBe(1920);
    expect(image.height).toBe(1080);
    expect(image.compressed).toBe(true);
    expect(image.status).toBe('pending');
    expect(image.createdAt).toBeTruthy();
    expect(image.sentAt).toBeNull();
  });

  it('creates an uploaded image with minimal fields', () => {
    const image = repo.createUploadedImage({
      sessionId,
      originalFilename: 'photo.jpg',
      storedPath: '/uploads/def456.jpg',
      mimeType: 'image/jpeg',
      fileSize: 102400,
    });

    expect(image.id).toBeTruthy();
    expect(image.sessionId).toBe(sessionId);
    expect(image.originalFilename).toBe('photo.jpg');
    expect(image.storedPath).toBe('/uploads/def456.jpg');
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.fileSize).toBe(102400);
    expect(image.width).toBeNull();
    expect(image.height).toBeNull();
    expect(image.compressed).toBe(false);
    expect(image.status).toBe('pending');
    expect(image.sentAt).toBeNull();
  });

  // ─── Get by ID ───

  it('retrieves an uploaded image by id', () => {
    const created = repo.createUploadedImage({
      sessionId,
      originalFilename: 'diagram.png',
      storedPath: '/uploads/ghi789.png',
      mimeType: 'image/png',
      fileSize: 51200,
      width: 800,
      height: 600,
    });

    const fetched = repo.getUploadedImage(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.originalFilename).toBe('diagram.png');
    expect(fetched!.storedPath).toBe('/uploads/ghi789.png');
    expect(fetched!.mimeType).toBe('image/png');
    expect(fetched!.fileSize).toBe(51200);
    expect(fetched!.width).toBe(800);
    expect(fetched!.height).toBe(600);
  });

  it('returns null for non-existent uploaded image id', () => {
    const result = repo.getUploadedImage('nonexistent-id');
    expect(result).toBeNull();
  });

  // ─── List by session ───

  it('lists all uploaded images for a session in creation order', () => {
    const img1 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'first.png',
      storedPath: '/uploads/first.png',
      mimeType: 'image/png',
      fileSize: 1000,
    });
    const img2 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'second.png',
      storedPath: '/uploads/second.png',
      mimeType: 'image/png',
      fileSize: 2000,
    });
    const img3 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'third.png',
      storedPath: '/uploads/third.png',
      mimeType: 'image/png',
      fileSize: 3000,
    });

    const images = repo.getUploadedImages(sessionId);
    expect(images).toHaveLength(3);
    expect(images[0].id).toBe(img1.id);
    expect(images[1].id).toBe(img2.id);
    expect(images[2].id).toBe(img3.id);
  });

  it('returns empty array for session with no uploaded images', () => {
    const images = repo.getUploadedImages(sessionId);
    expect(images).toHaveLength(0);
  });

  // ─── List by status filter ───

  it('filters uploaded images by pending status', () => {
    const img1 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'pending1.png',
      storedPath: '/uploads/pending1.png',
      mimeType: 'image/png',
      fileSize: 1000,
    });
    const img2 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'will-be-sent.png',
      storedPath: '/uploads/will-be-sent.png',
      mimeType: 'image/png',
      fileSize: 2000,
    });
    const img3 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'pending2.png',
      storedPath: '/uploads/pending2.png',
      mimeType: 'image/png',
      fileSize: 3000,
    });

    repo.markUploadedImageSent(img2.id);

    const pending = repo.getUploadedImages(sessionId, 'pending');
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe(img1.id);
    expect(pending[1].id).toBe(img3.id);
  });

  it('filters uploaded images by sent status', () => {
    const img1 = repo.createUploadedImage({
      sessionId,
      originalFilename: 'will-be-sent.png',
      storedPath: '/uploads/will-be-sent.png',
      mimeType: 'image/png',
      fileSize: 1000,
    });
    repo.createUploadedImage({
      sessionId,
      originalFilename: 'stays-pending.png',
      storedPath: '/uploads/stays-pending.png',
      mimeType: 'image/png',
      fileSize: 2000,
    });

    repo.markUploadedImageSent(img1.id);

    const sent = repo.getUploadedImages(sessionId, 'sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].originalFilename).toBe('will-be-sent.png');
  });

  // ─── Mark sent ───

  it('marks an uploaded image as sent with sentAt timestamp', () => {
    const image = repo.createUploadedImage({
      sessionId,
      originalFilename: 'to-send.png',
      storedPath: '/uploads/to-send.png',
      mimeType: 'image/png',
      fileSize: 5000,
    });

    expect(image.sentAt).toBeNull();
    expect(image.status).toBe('pending');

    repo.markUploadedImageSent(image.id);

    const updated = repo.getUploadedImage(image.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('sent');
    expect(updated!.sentAt).toBeTruthy();
  });

  // ─── Delete ───

  it('deletes an uploaded image and returns true', () => {
    const image = repo.createUploadedImage({
      sessionId,
      originalFilename: 'to-delete.png',
      storedPath: '/uploads/to-delete.png',
      mimeType: 'image/png',
      fileSize: 1000,
    });

    const deleted = repo.deleteUploadedImage(image.id);
    expect(deleted).toBe(true);

    const fetched = repo.getUploadedImage(image.id);
    expect(fetched).toBeNull();
  });

  it('returns false when deleting non-existent uploaded image', () => {
    const deleted = repo.deleteUploadedImage('nonexistent-id');
    expect(deleted).toBe(false);
  });
});
