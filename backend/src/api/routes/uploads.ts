import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Repository } from '../../models/repository.js';
import type { PreviewService } from '../../services/preview-service.js';
import { validateUuid } from '../middleware.js';
import { logger } from '../../services/logger.js';

export function createUploadsRouter(repo: Repository, previewService: PreviewService): Router {
  const router = Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const sessionId = String(req.params.id);
        const session = repo.getSession(sessionId);
        if (!session) {
          cb(new Error('Session not found'), '');
          return;
        }
        const dir = path.join(session.workingDirectory, '.c3-uploads', 'images');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `${uuid()}${ext}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      cb(null, allowed.includes(file.mimetype));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // POST /api/sessions/:id/upload-image — upload a single image file
  router.post('/:id/upload-image', validateUuid('id'), upload.single('image'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image file provided or unsupported file type' });
      return;
    }

    try {
      const file = req.file;
      const image = repo.createUploadedImage({
        sessionId,
        originalFilename: file.originalname,
        storedPath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
      });

      logger.info({ sessionId, imageId: image.id, originalFilename: file.originalname }, 'image uploaded');
      res.status(201).json(image);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to upload image');
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // GET /api/sessions/:id/uploaded-images — list images for session
  router.get('/:id/uploaded-images', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const status = req.query.status as 'pending' | 'sent' | undefined;
    if (status && !['pending', 'sent'].includes(status)) {
      res.status(400).json({ error: 'Invalid status filter. Must be pending or sent' });
      return;
    }

    try {
      const images = repo.getUploadedImages(sessionId, status);
      res.json(images);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to list uploaded images');
      res.status(500).json({ error: 'Failed to list uploaded images' });
    }
  });

  // POST /api/sessions/:id/uploaded-images/:imageId/deliver — deliver image to Claude
  router.post('/:id/uploaded-images/:imageId/deliver', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const imageId = String(req.params.imageId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const { message } = req.body || {};
      const result = previewService.deliverImage(sessionId, imageId, message);
      logger.info({ sessionId, imageId }, 'image delivered');
      res.json(result);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, imageId, err: errMessage }, 'failed to deliver image');
      if (errMessage.includes('not found')) {
        res.status(404).json({ error: errMessage });
      } else if (errMessage.includes('not active')) {
        res.status(400).json({ error: errMessage });
      } else {
        res.status(500).json({ error: 'Failed to deliver image' });
      }
    }
  });

  // GET /api/sessions/:id/uploaded-images/:imageId/file — serve actual image file
  router.get('/:id/uploaded-images/:imageId/file', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const imageId = String(req.params.imageId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const image = repo.getUploadedImage(imageId);
      if (!image) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      if (!fs.existsSync(image.storedPath)) {
        res.status(404).json({ error: 'Image file not found on disk' });
        return;
      }

      res.setHeader('Content-Type', image.mimeType);
      const stream = fs.createReadStream(image.storedPath);
      stream.pipe(res);
    } catch (err) {
      logger.error({ sessionId, imageId, err: err instanceof Error ? err.message : err }, 'failed to serve image file');
      res.status(500).json({ error: 'Failed to serve image file' });
    }
  });

  return router;
}
