import { EventEmitter } from 'node:events';
import { logger } from '../services/logger.js';

/**
 * Port forwarder manages SSH tunnel forwarding for remote worker ports.
 * For local workers, ports are accessed directly.
 * For remote workers, this creates SSH tunnels via ssh2 forwardOut().
 */
export class PortForwarder extends EventEmitter {
  private forwards = new Map<string, { remotePort: number; localPort: number }>();
  private nextLocalPort = 45000;

  /**
   * For local workers, just return the same port.
   * For remote workers (Phase 6), this will create an SSH tunnel.
   */
  getLocalPort(sessionId: string, remotePort: number, isLocal: boolean): number {
    if (isLocal) return remotePort;

    const key = `${sessionId}:${remotePort}`;
    const existing = this.forwards.get(key);
    if (existing) return existing.localPort;

    const localPort = this.nextLocalPort++;
    this.forwards.set(key, { remotePort, localPort });
    logger.info({ sessionId, remotePort, localPort }, 'port forward registered');
    return localPort;
  }

  removeForwards(sessionId: string): void {
    for (const [key] of this.forwards) {
      if (key.startsWith(`${sessionId}:`)) {
        this.forwards.delete(key);
      }
    }
  }

  destroy(): void {
    this.forwards.clear();
  }
}
