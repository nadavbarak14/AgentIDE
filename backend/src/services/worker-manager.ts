import { EventEmitter } from 'node:events';
import type { Repository } from '../models/repository.js';
import type { Worker } from '../models/types.js';
import { TunnelManager, type TunnelConfig } from '../hub/tunnel.js';
import { WorkerClient } from '../hub/worker-client.js';
import { logger } from './logger.js';

export class WorkerManager extends EventEmitter {
  private tunnelManager = new TunnelManager();
  private workerClient = new WorkerClient(this.tunnelManager);
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private repo: Repository) {
    super();
    this.setupTunnelListeners();
  }

  async connectWorker(worker: Worker): Promise<void> {
    if (worker.type === 'local') {
      this.repo.updateWorkerStatus(worker.id, 'connected');
      logger.info({ workerId: worker.id }, 'local worker marked connected');
      return;
    }

    if (!worker.sshHost || !worker.sshUser || !worker.sshKeyPath) {
      throw new Error('Missing SSH configuration');
    }

    const config: TunnelConfig = {
      host: worker.sshHost,
      port: worker.sshPort,
      username: worker.sshUser,
      privateKeyPath: worker.sshKeyPath,
    };

    try {
      logger.info({ workerId: worker.id, host: worker.sshHost }, 'connecting to remote worker');
      await this.tunnelManager.connect(worker.id, config);
      this.repo.updateWorkerStatus(worker.id, 'connected');
      logger.info({ workerId: worker.id }, 'remote worker connected');
    } catch (err) {
      logger.error({ workerId: worker.id, err }, 'failed to connect to remote worker');
      this.repo.updateWorkerStatus(worker.id, 'error');
      throw err;
    }
  }

  disconnectWorker(workerId: string): void {
    logger.info({ workerId }, 'disconnecting worker');
    this.tunnelManager.disconnect(workerId);
    this.repo.updateWorkerStatus(workerId, 'disconnected');
  }

  async testConnection(worker: Worker): Promise<{ ok: boolean; latency_ms: number }> {
    if (worker.type === 'local') {
      return { ok: true, latency_ms: 0 };
    }

    const start = Date.now();
    try {
      await this.tunnelManager.exec(worker.id, 'echo ok');
      const latency = Date.now() - start;
      logger.info({ workerId: worker.id, latency_ms: latency }, 'worker health check passed');
      return { ok: true, latency_ms: latency };
    } catch (err) {
      const latency = Date.now() - start;
      logger.warn({ workerId: worker.id, latency_ms: latency, err }, 'worker health check failed');
      return { ok: false, latency_ms: latency };
    }
  }

  getWorkerClient(): WorkerClient {
    return this.workerClient;
  }

  startHealthCheck(intervalMs = 30000): void {
    this.healthCheckInterval = setInterval(() => {
      const workers = this.repo.listWorkers();
      for (const worker of workers) {
        if (worker.type === 'remote' && worker.status === 'connected') {
          this.testConnection(worker).then((result) => {
            if (!result.ok) {
              this.repo.updateWorkerStatus(worker.id, 'error');
              this.emit('worker_unhealthy', worker.id);
            }
          });
        }
      }
    }, intervalMs);
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private setupTunnelListeners(): void {
    this.tunnelManager.on('connected', (workerId: string) => {
      this.repo.updateWorkerStatus(workerId, 'connected');
      this.emit('worker_connected', workerId);
    });

    this.tunnelManager.on('disconnected', (workerId: string) => {
      this.repo.updateWorkerStatus(workerId, 'disconnected');
      this.emit('worker_disconnected', workerId);
    });
  }

  destroy(): void {
    this.stopHealthCheck();
    this.tunnelManager.destroy();
  }
}
