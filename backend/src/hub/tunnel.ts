import net from 'node:net';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { Client, type ClientChannel } from 'ssh2';
import { createWorkerLogger } from '../services/logger.js';

/** Port on the remote machine where the reverse tunnel binds (must not conflict with remote services) */
export const REVERSE_TUNNEL_PORT = 43000;

export interface TunnelConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  /** If set, establishes a reverse port forward so processes on the remote machine can reach the hub via localhost:REVERSE_TUNNEL_PORT → hub:hubPort */
  hubPort?: number;
}

export class TunnelManager extends EventEmitter {
  private clients = new Map<string, Client>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectDelay = new Map<string, number>();

  connect(workerId: string, config: TunnelConfig): Promise<void> {
    const log = createWorkerLogger(workerId);
    
    return new Promise((resolve, reject) => {
      const client = new Client();
      
      client.on('ready', () => {
        log.info({ host: config.host }, 'SSH tunnel connected');
        this.clients.set(workerId, client);
        this.reconnectDelay.set(workerId, 1000);
        this.emit('connected', workerId);

        // Request reverse port forward so remote processes can reach hub at localhost:REVERSE_TUNNEL_PORT
        if (config.hubPort) {
          client.forwardIn('127.0.0.1', REVERSE_TUNNEL_PORT, (err, boundPort) => {
            if (err) {
              log.warn({ err: err.message, port: REVERSE_TUNNEL_PORT }, 'reverse port forward request failed');
            } else {
              log.info({ remotePort: boundPort || REVERSE_TUNNEL_PORT, hubPort: config.hubPort }, 'reverse port forward active');
            }
          });
        }

        resolve();
      });

      // Handle incoming TCP connections from the remote side (reverse tunnel)
      // Remote connects to REVERSE_TUNNEL_PORT → forward to local hubPort
      client.on('tcp connection', (_info, accept) => {
        const channel = accept();
        const localPort = config.hubPort || 3000;
        const local = net.createConnection(localPort, '127.0.0.1');
        channel.pipe(local);
        local.pipe(channel);
        local.on('error', () => { try { channel.destroy(); } catch { /* ignore */ } });
        channel.on('error', () => { try { local.destroy(); } catch { /* ignore */ } });
        local.on('close', () => { try { channel.destroy(); } catch { /* ignore */ } });
        channel.on('close', () => { try { local.destroy(); } catch { /* ignore */ } });
      });

      client.on('error', (err) => {
        log.error({ err: err.message }, 'SSH tunnel error');
        this.emit('error', workerId, err);
        reject(err);
      });

      client.on('close', () => {
        log.info('SSH tunnel closed');
        this.clients.delete(workerId);
        this.emit('disconnected', workerId);
        this.scheduleReconnect(workerId, config);
      });

      const privateKey = fs.readFileSync(config.privateKeyPath, 'utf-8');

      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        privateKey,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        readyTimeout: 10000,
      });
    });
  }

  disconnect(workerId: string): void {
    const client = this.clients.get(workerId);
    if (client) {
      client.end();
      this.clients.delete(workerId);
    }
    const timer = this.reconnectTimers.get(workerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(workerId);
    }
  }

  exec(workerId: string, command: string): Promise<string> {
    const client = this.clients.get(workerId);
    if (!client) throw new Error(`Worker ${workerId} not connected`);

    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('data', (data: Buffer) => { output += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { output += data.toString(); });
        stream.on('close', () => resolve(output));
      });
    });
  }

  shell(workerId: string, options: { cols?: number; rows?: number } = {}): Promise<ClientChannel> {
    const client = this.clients.get(workerId);
    if (!client) throw new Error(`Worker ${workerId} not connected`);

    const cols = options.cols || 120;
    const rows = options.rows || 40;

    return new Promise((resolve, reject) => {
      client.shell(
        { term: 'xterm-256color', cols, rows },
        (err: Error | undefined, stream: ClientChannel) => {
          if (err) return reject(err);
          resolve(stream);
        },
      );
    });
  }

  forwardOut(workerId: string, remoteHost: string, remotePort: number): Promise<ClientChannel> {
    const client = this.clients.get(workerId);
    if (!client) throw new Error(`Worker ${workerId} not connected`);

    return new Promise((resolve, reject) => {
      client.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
        if (err) return reject(err);
        resolve(stream);
      });
    });
  }

  isConnected(workerId: string): boolean {
    return this.clients.has(workerId);
  }

  private scheduleReconnect(workerId: string, config: TunnelConfig): void {
    const delay = this.reconnectDelay.get(workerId) || 1000;
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(workerId);
      try {
        await this.connect(workerId, config);
      } catch {
        // Exponential backoff
        this.reconnectDelay.set(workerId, Math.min(delay * 2, 30000));
      }
    }, delay);
    this.reconnectTimers.set(workerId, timer);
  }

  destroy(): void {
    for (const [workerId] of this.clients) {
      this.disconnect(workerId);
    }
  }
}
