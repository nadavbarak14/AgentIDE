import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import { Duplex } from 'node:stream';

// ── Mock logger ──────────────────────────────────────────────────────
vi.mock('../../src/services/logger.js', () => {
  const noop = () => {};
  const child = () => fakeLogger;
  const fakeLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child,
  };
  return {
    logger: fakeLogger,
    createWorkerLogger: () => fakeLogger,
  };
});

// ── Import after mocks ──────────────────────────────────────────────
const { AgentTunnelManager } = await import('../../src/hub/agent-tunnel.js');

/** Create a mock duplex stream that acts as an SSH channel */
function makeDuplexStream(): Duplex {
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      // Echo data back to the other side (for pipe testing)
      this.push(chunk);
      callback();
    },
  });
  return stream;
}

/** Create a minimal mock TunnelManager */
function makeMockTunnelManager(forwardOutFn?: (...args: unknown[]) => Promise<Duplex>) {
  return {
    forwardOut: forwardOutFn ?? vi.fn().mockResolvedValue(makeDuplexStream()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    exec: vi.fn(),
    shell: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    destroy: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  };
}

describe('AgentTunnelManager', () => {
  let manager: InstanceType<typeof AgentTunnelManager>;
  let mockTunnelManager: ReturnType<typeof makeMockTunnelManager>;

  beforeEach(() => {
    mockTunnelManager = makeMockTunnelManager();
    manager = new AgentTunnelManager(mockTunnelManager as any);
  });

  afterEach(async () => {
    await manager.destroy();
  });

  // ── connect / disconnect lifecycle ─────────────────────────────────

  describe('connect', () => {
    it('returns a local port number', async () => {
      const port = await manager.connect('worker-1', 4321);
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThanOrEqual(46000);
    });

    it('increments local port for each new connection', async () => {
      const port1 = await manager.connect('worker-1', 4321);
      const port2 = await manager.connect('worker-2', 4322);
      expect(port2).toBe(port1 + 1);
    });

    it('marks the worker as connected', async () => {
      expect(manager.isConnected('worker-1')).toBe(false);
      await manager.connect('worker-1', 4321);
      expect(manager.isConnected('worker-1')).toBe(true);
    });

    it('disconnects existing tunnel before creating a new one for the same worker', async () => {
      const port1 = await manager.connect('worker-1', 4321);
      const port2 = await manager.connect('worker-1', 4322);

      // Should get a different port since old one was cleaned up
      expect(port2).not.toBe(port1);
      expect(manager.isConnected('worker-1')).toBe(true);
      expect(manager.getLocalPort('worker-1')).toBe(port2);
    });
  });

  describe('disconnect', () => {
    it('removes the worker tunnel', async () => {
      await manager.connect('worker-1', 4321);
      expect(manager.isConnected('worker-1')).toBe(true);

      await manager.disconnect('worker-1');
      expect(manager.isConnected('worker-1')).toBe(false);
    });

    it('clears the local port mapping', async () => {
      await manager.connect('worker-1', 4321);
      expect(manager.getLocalPort('worker-1')).not.toBeNull();

      await manager.disconnect('worker-1');
      expect(manager.getLocalPort('worker-1')).toBeNull();
    });

    it('is a no-op for unknown workers', async () => {
      // Should not throw
      await manager.disconnect('nonexistent');
    });

    it('can disconnect and reconnect the same worker', async () => {
      await manager.connect('worker-1', 4321);
      await manager.disconnect('worker-1');
      expect(manager.isConnected('worker-1')).toBe(false);

      const port = await manager.connect('worker-1', 4321);
      expect(manager.isConnected('worker-1')).toBe(true);
      expect(typeof port).toBe('number');
    });
  });

  // ── getLocalPort ───────────────────────────────────────────────────

  describe('getLocalPort', () => {
    it('returns the local port for a connected worker', async () => {
      const port = await manager.connect('worker-1', 4321);
      expect(manager.getLocalPort('worker-1')).toBe(port);
    });

    it('returns null for an unknown worker', () => {
      expect(manager.getLocalPort('nonexistent')).toBeNull();
    });

    it('returns null after disconnecting', async () => {
      await manager.connect('worker-1', 4321);
      await manager.disconnect('worker-1');
      expect(manager.getLocalPort('worker-1')).toBeNull();
    });
  });

  // ── isConnected ────────────────────────────────────────────────────

  describe('isConnected', () => {
    it('returns false for unknown worker', () => {
      expect(manager.isConnected('worker-1')).toBe(false);
    });

    it('returns true after connecting', async () => {
      await manager.connect('worker-1', 4321);
      expect(manager.isConnected('worker-1')).toBe(true);
    });

    it('returns false after disconnecting', async () => {
      await manager.connect('worker-1', 4321);
      await manager.disconnect('worker-1');
      expect(manager.isConnected('worker-1')).toBe(false);
    });
  });

  // ── isHealthy ──────────────────────────────────────────────────────

  describe('isHealthy', () => {
    it('returns false for unknown worker', () => {
      expect(manager.isHealthy('worker-1')).toBe(false);
    });

    it('returns false for newly connected (unchecked) worker', async () => {
      await manager.connect('worker-1', 4321);
      expect(manager.isHealthy('worker-1')).toBe(false);
    });
  });

  // ── checkHealth ────────────────────────────────────────────────────

  describe('checkHealth', () => {
    it('returns false for unknown worker', async () => {
      const result = await manager.checkHealth('nonexistent');
      expect(result).toBe(false);
    });

    it('returns true when remote agent responds 200 on /api/health', async () => {
      // Create a tiny HTTP server to act as the "remote agent"
      const fakeAgent = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });

      // We need to make the tunnel's local port point to the fake agent.
      // Strategy: connect first to get a local port, then start the fake agent
      // on that port. But AgentTunnelManager allocates the port and listens on it,
      // so we need the fake agent to be reachable through the tunnel.
      //
      // Instead, we create the fake agent on a known port, then set up
      // the tunnel manager's forwardOut to pipe to our fake agent.

      const agentPort = await new Promise<number>((resolve) => {
        fakeAgent.listen(0, '127.0.0.1', () => {
          const addr = fakeAgent.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        // Create a mock forwardOut that connects to the fakeAgent
        const forwardFn = vi.fn().mockImplementation(() => {
          return new Promise<Duplex>((resolve) => {
            const socket = net.createConnection({ host: '127.0.0.1', port: agentPort }, () => {
              resolve(socket);
            });
          });
        });

        const tunnelMgr = makeMockTunnelManager(forwardFn);
        const mgr = new AgentTunnelManager(tunnelMgr as any);

        await mgr.connect('worker-health', 4321);

        // checkHealth hits the tunnel's local port -> forwardOut -> fakeAgent
        const healthy = await mgr.checkHealth('worker-health');
        expect(healthy).toBe(true);
        expect(mgr.isHealthy('worker-health')).toBe(true);

        await mgr.destroy();
      } finally {
        await new Promise<void>((resolve) => fakeAgent.close(() => resolve()));
      }
    });

    it('returns false when remote agent responds non-200', async () => {
      const fakeAgent = http.createServer((_req, res) => {
        res.writeHead(503);
        res.end('service unavailable');
      });

      const agentPort = await new Promise<number>((resolve) => {
        fakeAgent.listen(0, '127.0.0.1', () => {
          const addr = fakeAgent.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        const forwardFn = vi.fn().mockImplementation(() => {
          return new Promise<Duplex>((resolve) => {
            const socket = net.createConnection({ host: '127.0.0.1', port: agentPort }, () => {
              resolve(socket);
            });
          });
        });

        const tunnelMgr = makeMockTunnelManager(forwardFn);
        const mgr = new AgentTunnelManager(tunnelMgr as any);

        await mgr.connect('worker-unhealthy', 4321);

        const healthy = await mgr.checkHealth('worker-unhealthy');
        expect(healthy).toBe(false);
        expect(mgr.isHealthy('worker-unhealthy')).toBe(false);

        await mgr.destroy();
      } finally {
        await new Promise<void>((resolve) => fakeAgent.close(() => resolve()));
      }
    });

    it('returns false when connection fails', async () => {
      // forwardOut rejects, so the tunnel server closes the socket
      const forwardFn = vi.fn().mockRejectedValue(new Error('SSH channel open failed'));

      const tunnelMgr = makeMockTunnelManager(forwardFn);
      const mgr = new AgentTunnelManager(tunnelMgr as any);

      await mgr.connect('worker-fail', 4321);

      const healthy = await mgr.checkHealth('worker-fail');
      expect(healthy).toBe(false);
      expect(mgr.isHealthy('worker-fail')).toBe(false);

      await mgr.destroy();
    });

    it('updates cached health status on success then failure', async () => {
      const fakeAgent = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end('ok');
      });

      const agentPort = await new Promise<number>((resolve) => {
        fakeAgent.listen(0, '127.0.0.1', () => {
          const addr = fakeAgent.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        const forwardFn = vi.fn().mockImplementation(() => {
          return new Promise<Duplex>((resolve) => {
            const socket = net.createConnection({ host: '127.0.0.1', port: agentPort }, () => {
              resolve(socket);
            });
          });
        });

        const tunnelMgr = makeMockTunnelManager(forwardFn);
        const mgr = new AgentTunnelManager(tunnelMgr as any);

        await mgr.connect('worker-flip', 4321);

        // First check: healthy
        const result1 = await mgr.checkHealth('worker-flip');
        expect(result1).toBe(true);
        expect(mgr.isHealthy('worker-flip')).toBe(true);

        // Close the fake agent so next check fails
        await new Promise<void>((resolve) => fakeAgent.close(() => resolve()));

        // Now make forwardOut reject to simulate SSH failure
        forwardFn.mockRejectedValue(new Error('closed'));

        const result2 = await mgr.checkHealth('worker-flip');
        expect(result2).toBe(false);
        expect(mgr.isHealthy('worker-flip')).toBe(false);

        await mgr.destroy();
      } catch {
        await new Promise<void>((resolve) => fakeAgent.close(() => resolve()));
      }
    });
  });

  // ── TCP forwarding (pipe behavior) ─────────────────────────────────

  describe('TCP forwarding', () => {
    it('forwards TCP connections through forwardOut to the remote agent', async () => {
      // Set up a real TCP server to act as the "remote agent"
      const receivedData: string[] = [];
      const fakeAgent = net.createServer((socket) => {
        socket.on('data', (data) => {
          receivedData.push(data.toString());
          socket.write(`echo:${data.toString()}`);
        });
      });

      const agentPort = await new Promise<number>((resolve) => {
        fakeAgent.listen(0, '127.0.0.1', () => {
          const addr = fakeAgent.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        const forwardFn = vi.fn().mockImplementation(() => {
          return new Promise<Duplex>((resolve) => {
            const socket = net.createConnection({ host: '127.0.0.1', port: agentPort }, () => {
              resolve(socket);
            });
          });
        });

        const tunnelMgr = makeMockTunnelManager(forwardFn);
        const mgr = new AgentTunnelManager(tunnelMgr as any);

        const localPort = await mgr.connect('worker-pipe', 4321);

        // Connect to the local tunnel port and send data
        const response = await new Promise<string>((resolve, reject) => {
          const client = net.createConnection({ host: '127.0.0.1', port: localPort }, () => {
            client.write('hello');
          });
          client.on('data', (data) => {
            resolve(data.toString());
            client.destroy();
          });
          client.on('error', reject);
        });

        expect(receivedData).toContain('hello');
        expect(response).toBe('echo:hello');

        // Verify forwardOut was called with the right parameters
        expect(forwardFn).toHaveBeenCalledWith('worker-pipe', '127.0.0.1', 4321);

        await mgr.destroy();
      } finally {
        await new Promise<void>((resolve) => fakeAgent.close(() => resolve()));
      }
    });

    it('destroys socket when forwardOut rejects', async () => {
      const forwardFn = vi.fn().mockRejectedValue(new Error('SSH not connected'));

      const tunnelMgr = makeMockTunnelManager(forwardFn);
      const mgr = new AgentTunnelManager(tunnelMgr as any);

      const localPort = await mgr.connect('worker-err', 4321);

      // Connect to the local tunnel port — expect it to be closed
      await new Promise<void>((resolve) => {
        const client = net.createConnection({ host: '127.0.0.1', port: localPort }, () => {
          client.write('hello');
        });
        client.on('close', () => {
          resolve();
        });
        client.on('error', () => {
          resolve();
        });
      });

      await mgr.destroy();
    });
  });

  // ── destroy ────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('closes all tunnels', async () => {
      await manager.connect('worker-1', 4321);
      await manager.connect('worker-2', 4322);
      await manager.connect('worker-3', 4323);

      expect(manager.isConnected('worker-1')).toBe(true);
      expect(manager.isConnected('worker-2')).toBe(true);
      expect(manager.isConnected('worker-3')).toBe(true);

      await manager.destroy();

      expect(manager.isConnected('worker-1')).toBe(false);
      expect(manager.isConnected('worker-2')).toBe(false);
      expect(manager.isConnected('worker-3')).toBe(false);
    });

    it('clears all local port mappings', async () => {
      await manager.connect('worker-1', 4321);
      await manager.connect('worker-2', 4322);

      await manager.destroy();

      expect(manager.getLocalPort('worker-1')).toBeNull();
      expect(manager.getLocalPort('worker-2')).toBeNull();
    });

    it('is safe to call multiple times', async () => {
      await manager.connect('worker-1', 4321);

      await manager.destroy();
      await manager.destroy(); // Should not throw
    });

    it('is safe to call with no tunnels', async () => {
      await manager.destroy(); // Should not throw
    });
  });

  // ── port allocation ────────────────────────────────────────────────

  describe('port allocation', () => {
    it('starts allocating ports from 46000+', async () => {
      // Create a fresh manager to test initial port allocation
      const freshMgr = new AgentTunnelManager(mockTunnelManager as any);
      const port = await freshMgr.connect('worker-first', 4321);
      expect(port).toBeGreaterThanOrEqual(46000);
      await freshMgr.destroy();
    });

    it('allocates sequential ports for multiple workers', async () => {
      const freshMgr = new AgentTunnelManager(mockTunnelManager as any);
      const ports: number[] = [];

      for (let i = 0; i < 5; i++) {
        const port = await freshMgr.connect(`worker-seq-${i}`, 4321 + i);
        ports.push(port);
      }

      // Verify sequential allocation
      for (let i = 1; i < ports.length; i++) {
        expect(ports[i]).toBe(ports[i - 1] + 1);
      }

      await freshMgr.destroy();
    });

    it('does not reuse ports after disconnect', async () => {
      const freshMgr = new AgentTunnelManager(mockTunnelManager as any);

      const port1 = await freshMgr.connect('worker-a', 4321);
      await freshMgr.disconnect('worker-a');

      const port2 = await freshMgr.connect('worker-b', 4322);
      expect(port2).toBeGreaterThan(port1);

      await freshMgr.destroy();
    });
  });

  // ── EventEmitter inheritance ───────────────────────────────────────

  describe('EventEmitter', () => {
    it('extends EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.removeListener).toBe('function');
    });
  });
});
