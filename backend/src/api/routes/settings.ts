import { Router } from 'express';
import type { Repository } from '../../models/repository.js';

export function createSettingsRouter(repo: Repository): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const settings = repo.getSettings();
    res.json(settings);
  });

  router.patch('/', (req, res) => {
    const { maxVisibleSessions, autoApprove, gridLayout, theme } = req.body;
    const input: Record<string, unknown> = {};

    if (maxVisibleSessions !== undefined) {
      if (typeof maxVisibleSessions !== 'number' || maxVisibleSessions < 1) {
        res.status(400).json({ error: 'maxVisibleSessions must be a positive number' });
        return;
      }
      input.maxVisibleSessions = maxVisibleSessions;
    }
    if (autoApprove !== undefined) {
      input.autoApprove = Boolean(autoApprove);
    }
    if (gridLayout !== undefined) {
      if (!['auto', '1x1', '2x2', '3x3'].includes(gridLayout)) {
        res.status(400).json({ error: 'gridLayout must be one of: auto, 1x1, 2x2, 3x3' });
        return;
      }
      input.gridLayout = gridLayout;
    }
    if (theme !== undefined) {
      if (!['dark', 'light'].includes(theme)) {
        res.status(400).json({ error: 'theme must be one of: dark, light' });
        return;
      }
      input.theme = theme;
    }

    const settings = repo.updateSettings(input);
    res.json(settings);
  });

  return router;
}
