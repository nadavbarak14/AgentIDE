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
   * Check if a specific worker has capacity for another session.
   */
  private workerHasCapacity(workerId: string): boolean {
    const worker = this.repo.getWorker(workerId);
    if (!worker) return false;
    const active = this.repo.getActiveSessionsOnWorker(workerId);
    return active < worker.maxSessions;
  }

  /**
   * Try to dispatch the next queued session if a slot is available.
   * Returns the session to activate, or null if no slot or no queued session.
   */
  tryDispatch(): Session | null {
    // Check global ceiling
    const settings = this.repo.getSettings();
    const activeCount = this.repo.countActiveSessions();
    if (activeCount >= settings.maxConcurrentSessions) {
      return null;
    }

    const next = this.repo.getNextQueuedSession();
    if (!next) return null;

    // Check per-worker capacity for the session's target worker
    if (next.workerId) {
      if (!this.workerHasCapacity(next.workerId)) {
        logger.debug(
          { sessionId: next.id, workerId: next.workerId },
          'target worker at capacity, skipping dispatch',
        );
        return null;
      }
    }

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
      { sessionId: next.id, workerId: next.workerId, activeCount, maxSessions: settings.maxConcurrentSessions },
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
   * Checks both global ceiling and per-worker capacity.
   */
  hasAvailableSlot(workerId?: string | null): boolean {
    // Global ceiling check
    const settings = this.repo.getSettings();
    const activeCount = this.repo.countActiveSessions();
    if (activeCount >= settings.maxConcurrentSessions) return false;

    // If a specific worker is specified, check that worker's capacity
    if (workerId) {
      return this.workerHasCapacity(workerId);
    }

    // No specific worker — check if ANY worker has capacity
    const allWorkers = this.repo.listWorkers();
    return allWorkers.some((w) => {
      const active = this.repo.getActiveSessionsOnWorker(w.id);
      return active < w.maxSessions;
    });
  }

  /**
   * Check if there are sessions waiting in the queue.
   */
  hasQueuedSessions(): boolean {
    return this.repo.getNextQueuedSession() !== null;
  }
}
