import net from 'node:net';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import type { TunnelManager } from './tunnel.js';
import { logger } from '../services/logger.js';

interface AgentTunnel {
  workerId: string;
  remoteAgentPort: number;
  localPort: number;
  server: net.Server;
  healthy: boolean;
}

/**
 * Manages SSH tunnels from the hub to remote agents.
 * Creates a local TCP listener for each remote worker that
 * pipes connections through SSH forwardOut() to the agent port.
 */
export class AgentTunnelManager extends EventEmitter {
  private tunnels = new Map<string, AgentTunnel>();
  private nextLocalPort = 46000;
  private tunnelManager: TunnelManager;

  constructor(tunnelManager: TunnelManager) {
    super();
    this.tunnelManager = tunnelManager;
  }

  /**
   * Establish an SSH tunnel to a remote agent.
   * Creates a local TCP server that forwards connections to the remote agent port.
   */
  async connect(workerId: string, remoteAgentPort: number): Promise<number> {
    // Clean up existing tunnel if any
    if (this.tunnels.has(workerId)) {
      await this.disconnect(workerId);
    }

    const localPort = this.nextLocalPort++;
    const server = net.createServer((socket) => {
      this.tunnelManager.forwardOut(workerId, '127.0.0.1', remoteAgentPort)
        .then((sshStream) => {
          socket.pipe(sshStream);
          sshStream.pipe(socket);
          socket.on('error', () => sshStream.destroy());
          sshStream.on('error', () => socket.destroy());
          socket.on('close', () => sshStream.destroy());
          sshStream.on('close', () => socket.destroy());
        })
        .catch((err) => {
          logger.warn({ workerId, error: err.message }, 'agent tunnel forwardOut failed');
          socket.destroy();
        });
    });

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        logger.error({ workerId, localPort, error: err.message }, 'agent tunnel server error');
        reject(err);
      });

      server.listen(localPort, '127.0.0.1', () => {
        const tunnel: AgentTunnel = {
          workerId,
          remoteAgentPort,
          localPort,
          server,
          healthy: false,
        };
        this.tunnels.set(workerId, tunnel);
        logger.info({ workerId, localPort, remoteAgentPort }, 'agent tunnel listening');
        resolve(localPort);
      });
    });
  }

  /** Disconnect and clean up tunnel for a worker */
  async disconnect(workerId: string): Promise<void> {
    const tunnel = this.tunnels.get(workerId);
    if (!tunnel) return;

    return new Promise((resolve) => {
      tunnel.server.close(() => {
        logger.info({ workerId }, 'agent tunnel closed');
        this.tunnels.delete(workerId);
        resolve();
      });
      // Force-close any lingering connections
      tunnel.server.unref();
    });
  }

  /** Get the local port that tunnels to the remote agent for a given worker */
  getLocalPort(workerId: string): number | null {
    const tunnel = this.tunnels.get(workerId);
    return tunnel ? tunnel.localPort : null;
  }

  /** Check if the remote agent is healthy by hitting GET /api/health */
  async checkHealth(workerId: string): Promise<boolean> {
    const tunnel = this.tunnels.get(workerId);
    if (!tunnel) return false;

    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: tunnel.localPort,
          path: '/api/health',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          res.resume(); // Drain response
          res.on('end', () => {
            const healthy = res.statusCode === 200;
            tunnel.healthy = healthy;
            resolve(healthy);
          });
        },
      );
      req.on('error', () => {
        tunnel.healthy = false;
        resolve(false);
      });
      req.on('timeout', () => {
        req.destroy();
        tunnel.healthy = false;
        resolve(false);
      });
      req.end();
    });
  }

  /** Check if a worker has a healthy agent tunnel */
  isHealthy(workerId: string): boolean {
    const tunnel = this.tunnels.get(workerId);
    return tunnel?.healthy ?? false;
  }

  /** Check if a worker has an established tunnel (may or may not be healthy) */
  isConnected(workerId: string): boolean {
    return this.tunnels.has(workerId);
  }

  /** Clean up all tunnels */
  async destroy(): Promise<void> {
    const disconnects = Array.from(this.tunnels.keys()).map((id) => this.disconnect(id));
    await Promise.all(disconnects);
  }
}
