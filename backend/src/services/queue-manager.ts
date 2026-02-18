import { EventEmitter } from 'node:events';
import type { Repository } from '../models/repository.js';
import type { Session } from '../models/types.js';
import { logger } from './logger.js';

export class QueueManager extends EventEmitter {
  private dispatchInterval: ReturnType<typeof setInterval> | null = null;
  private lastDispatchTime = 0;
  private pendingDispatchTimer: ReturnType<typeof setTimeout> | null = null;
  private dispatchDelayMs: number;

  constructor(private repo: Repository, opts?: { dispatchDelayMs?: number }) {
    super();
    this.dispatchDelayMs = opts?.dispatchDelayMs ?? 3000;
  }

  /**
   * Try to dispatch the next queued session if a slot is available.
   * Returns the session to activate, or null if no slot or no queued session.
   */
  tryDispatch(): Session | null {
    const settings = this.repo.getSettings();
    const activeCount = this.repo.countActiveSessions();

    if (activeCount >= settings.maxConcurrentSessions) {
      return null;
    }

    const next = this.repo.getNextQueuedSession();
    if (!next) return null;

    // Enforce minimum gap between dispatches
    const now = Date.now();
    const elapsed = now - this.lastDispatchTime;
    if (elapsed < this.dispatchDelayMs && this.lastDispatchTime > 0) {
      // Schedule a delayed dispatch if not already scheduled
      if (!this.pendingDispatchTimer) {
        const remaining = this.dispatchDelayMs - elapsed;
        logger.info({ remaining }, 'delaying dispatch to respect 3s gap');
        this.pendingDispatchTimer = setTimeout(() => {
          this.pendingDispatchTimer = null;
          this.tryDispatch();
        }, remaining);
      }
      return null;
    }

    this.lastDispatchTime = now;

    logger.info(
      { sessionId: next.id, activeCount, maxSessions: settings.maxConcurrentSessions },
      'dispatching queued session',
    );

    // Emit event so session-manager can activate it
    this.emit('dispatch', next);
    return next;
  }

  /**
   * Start auto-dispatch polling loop.
   */
  startAutoDispatch(intervalMs = 3000): void {
    if (this.dispatchInterval) return;
    this.dispatchInterval = setInterval(() => {
      this.tryDispatch();
    }, intervalMs);
    logger.info({ intervalMs }, 'auto-dispatch started');
  }

  stopAutoDispatch(): void {
    if (this.dispatchInterval) {
      clearInterval(this.dispatchInterval);
      this.dispatchInterval = null;
      logger.info('auto-dispatch stopped');
    }
    if (this.pendingDispatchTimer) {
      clearTimeout(this.pendingDispatchTimer);
      this.pendingDispatchTimer = null;
    }
  }

  /**
   * Called when a session completes — try to dispatch next in queue.
   */
  onSessionCompleted(): void {
    this.tryDispatch();
  }

  /**
   * Check if there's capacity to activate immediately (used when creating sessions).
   */
  hasAvailableSlot(): boolean {
    const settings = this.repo.getSettings();
    const activeCount = this.repo.countActiveSessions();
    return activeCount < settings.maxConcurrentSessions;
  }

  /**
   * Check if there are sessions waiting in the queue.
   */
  hasQueuedSessions(): boolean {
    return this.repo.getNextQueuedSession() !== null;
  }
}
