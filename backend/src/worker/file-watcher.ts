import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';
import { logger } from '../services/logger.js';
import { scanPorts, type DetectedPort } from './port-scanner.js';

/** Directories to ignore when watching for changes */
const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/coverage/**',
];

const DEBOUNCE_MS = 500;

export interface FileChangeEvent {
  sessionId: string;
  paths: string[];
  timestamp: string;
}

export interface PortChangeEvent {
  sessionId: string;
  port: number;
  pid: number;
  process: string;
  action: 'detected' | 'closed';
}

const PORT_SCAN_INTERVAL = 5000;

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  private pendingChanges = new Map<string, Set<string>>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private portScanTimers = new Map<string, ReturnType<typeof setInterval>>();
  private knownPorts = new Map<string, Map<number, DetectedPort>>();
  private sessionPids = new Map<string, number>();

  /**
   * Start watching a directory for file changes and scanning for ports.
   * Changes are debounced over 500ms before being emitted.
   * @param sessionId - The session to associate changes with
   * @param directory - The directory to watch recursively
   * @param pid - Optional PID of the session's process (for port filtering)
   */
  startWatching(sessionId: string, directory: string, pid?: number): void {
    // Stop any existing watcher for this session
    if (this.watchers.has(sessionId)) {
      this.stopWatching(sessionId);
    }

    logger.info({ sessionId, directory }, 'starting file watcher');

    const watcher = watch(directory, {
      ignored: IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    const handleChange = (filePath: string) => {
      this.queueChange(sessionId, filePath);
    };

    watcher.on('add', handleChange);
    watcher.on('change', handleChange);
    watcher.on('unlink', handleChange);
    watcher.on('addDir', handleChange);
    watcher.on('unlinkDir', handleChange);

    watcher.on('error', (err: unknown) => {
      logger.error({ err, sessionId, directory }, 'file watcher error');
    });

    this.watchers.set(sessionId, watcher);

    // Start port scanning if PID provided
    if (pid) {
      this.sessionPids.set(sessionId, pid);
      this.knownPorts.set(sessionId, new Map());
      this.startPortScanning(sessionId, pid);
    }
  }

  /**
   * Stop watching for a given session and clean up resources.
   * @param sessionId - The session to stop watching
   */
  stopWatching(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      logger.info({ sessionId }, 'stopping file watcher');
      watcher.close().catch((err: unknown) => {
        logger.error({ err, sessionId }, 'error closing file watcher');
      });
      this.watchers.delete(sessionId);
    }

    // Clear pending changes and timers
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }
    this.pendingChanges.delete(sessionId);

    // Stop port scanning
    const portTimer = this.portScanTimers.get(sessionId);
    if (portTimer) {
      clearInterval(portTimer);
      this.portScanTimers.delete(sessionId);
    }

    // Emit port_closed for any known ports
    const ports = this.knownPorts.get(sessionId);
    if (ports) {
      for (const [port, info] of ports) {
        this.emit('port_change', {
          sessionId,
          port,
          pid: info.pid,
          process: info.process,
          action: 'closed',
        } satisfies PortChangeEvent);
      }
      this.knownPorts.delete(sessionId);
    }
    this.sessionPids.delete(sessionId);
  }

  /**
   * Queue a file change and schedule a debounced emission.
   */
  private queueChange(sessionId: string, filePath: string): void {
    let changes = this.pendingChanges.get(sessionId);
    if (!changes) {
      changes = new Set();
      this.pendingChanges.set(sessionId, changes);
    }
    changes.add(filePath);

    // Reset the debounce timer
    const existingTimer = this.debounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.flushChanges(sessionId);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(sessionId, timer);
  }

  /**
   * Emit all queued changes for a session.
   */
  private flushChanges(sessionId: string): void {
    const changes = this.pendingChanges.get(sessionId);
    if (!changes || changes.size === 0) return;

    const event: FileChangeEvent = {
      sessionId,
      paths: Array.from(changes),
      timestamp: new Date().toISOString(),
    };

    this.emit('changes', event);

    // Clear the pending set and timer
    this.pendingChanges.delete(sessionId);
    this.debounceTimers.delete(sessionId);
  }

  /**
   * Check whether a session is currently being watched.
   */
  isWatching(sessionId: string): boolean {
    return this.watchers.has(sessionId);
  }

  /**
   * Start polling for listening ports associated with a session's process tree.
   */
  private startPortScanning(sessionId: string, pid: number): void {
    const timer = setInterval(() => {
      const currentPorts = scanPorts([pid]);
      const known = this.knownPorts.get(sessionId) || new Map();
      const currentPortSet = new Set(currentPorts.map((p) => p.port));

      // Detect new ports
      for (const detected of currentPorts) {
        if (!known.has(detected.port)) {
          known.set(detected.port, detected);
          this.emit('port_change', {
            sessionId,
            port: detected.port,
            pid: detected.pid,
            process: detected.process,
            action: 'detected',
          } satisfies PortChangeEvent);
        }
      }

      // Detect closed ports
      for (const [port, info] of known) {
        if (!currentPortSet.has(port)) {
          known.delete(port);
          this.emit('port_change', {
            sessionId,
            port,
            pid: info.pid,
            process: info.process,
            action: 'closed',
          } satisfies PortChangeEvent);
        }
      }

      this.knownPorts.set(sessionId, known);
    }, PORT_SCAN_INTERVAL);

    this.portScanTimers.set(sessionId, timer);
  }

  /**
   * Stop all watchers and clean up all resources.
   */
  destroy(): void {
    for (const [sessionId] of this.watchers) {
      this.stopWatching(sessionId);
    }
  }
}
