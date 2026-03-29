import { EventEmitter } from 'node:events';
import { logger } from '../services/logger.js';
import { scanPorts, type DetectedPort } from './port-scanner.js';

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

/**
 * Lightweight session monitor — port scanning only, no filesystem watching.
 *
 * Chokidar file watching was removed because:
 * - It created 100K+ inotify watches on large projects, consuming 4-6 GB of RAM
 * - It blocked the event loop during startup (initial directory scan)
 * - Real-time file change notifications aren't needed — Claude's terminal output
 *   already tells the UI what happened
 *
 * Port scanning is kept because the preview panel needs to auto-detect dev servers.
 * The class name is kept as FileWatcher for backwards compatibility.
 */
export class FileWatcher extends EventEmitter {
  private activeSessions = new Set<string>();
  private portScanTimers = new Map<string, ReturnType<typeof setInterval>>();
  private knownPorts = new Map<string, Map<number, DetectedPort>>();
  private sessionPids = new Map<string, number>();

  /**
   * Start monitoring a session (port scanning only).
   */
  startWatching(sessionId: string, _directory: string, pid?: number): void {
    if (this.activeSessions.has(sessionId)) {
      this.stopWatching(sessionId);
    }

    this.activeSessions.add(sessionId);

    if (pid) {
      this.sessionPids.set(sessionId, pid);
      this.knownPorts.set(sessionId, new Map());
      this.startPortScanning(sessionId, pid);
      logger.info({ sessionId, pid }, 'started port scanning');
    }
  }

  /**
   * Stop monitoring a session and clean up resources.
   */
  stopWatching(sessionId: string): void {
    this.activeSessions.delete(sessionId);

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
   * Check whether a session is currently being monitored.
   */
  isWatching(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get currently known listening ports for a session.
   */
  getKnownPorts(sessionId: string): DetectedPort[] {
    const ports = this.knownPorts.get(sessionId);
    if (!ports) return [];
    return [...ports.values()];
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
   * Stop all monitoring and clean up all resources.
   */
  destroy(): void {
    for (const sessionId of [...this.activeSessions]) {
      this.stopWatching(sessionId);
    }
  }
}
