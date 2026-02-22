import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { Repository } from '../models/repository.js';
import type { Worker } from '../models/types.js';
import { TunnelManager, type TunnelConfig } from '../hub/tunnel.js';
import { AgentTunnelManager } from '../hub/agent-tunnel.js';
import { WorkerClient } from '../hub/worker-client.js';
import { logger } from './logger.js';

export class WorkerManager extends EventEmitter {
  private tunnelManager = new TunnelManager();
  private agentTunnelManager = new AgentTunnelManager(this.tunnelManager);
  private workerClient = new WorkerClient(this.tunnelManager);
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private repo: Repository) {
    super();
    this.setupTunnelListeners();
  }

  /**
   * Validate that an SSH private key file exists, is readable, and is not passphrase-protected.
   * Throws descriptive errors for each failure mode.
   */
  validateSshKeyFile(keyPath: string): void {
    // Check file exists
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSH key file not found: ${keyPath}`);
    }

    // Check file is readable
    try {
      fs.accessSync(keyPath, fs.constants.R_OK);
    } catch {
      throw new Error(`SSH key file is not readable (check permissions): ${keyPath}`);
    }

    // Read and check for passphrase-protected keys
    const content = fs.readFileSync(keyPath, 'utf-8');

    // Older PEM format: "Proc-Type: 4,ENCRYPTED" in header
    if (content.includes('ENCRYPTED')) {
      throw new Error(
        'SSH key is passphrase-protected. AgentIDE requires a key without a passphrase. ' +
        'Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/agentide_key -N ""'
      );
    }

    // Verify it looks like a PEM private key
    if (!content.includes('PRIVATE KEY')) {
      throw new Error(`File does not appear to be a private key: ${keyPath}`);
    }
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

    // Validate key file before attempting connection
    this.validateSshKeyFile(worker.sshKeyPath);

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

      // If worker has a remote agent port, establish agent tunnel
      if (worker.remoteAgentPort) {
        try {
          const localPort = await this.agentTunnelManager.connect(worker.id, worker.remoteAgentPort);
          logger.info({ workerId: worker.id, remoteAgentPort: worker.remoteAgentPort, localPort }, 'agent tunnel established');

          // Verify agent health
          const healthy = await this.agentTunnelManager.checkHealth(worker.id);
          if (!healthy) {
            logger.warn({ workerId: worker.id, remoteAgentPort: worker.remoteAgentPort }, 'remote agent not responding on configured port');
          } else {
            logger.info({ workerId: worker.id }, 'remote agent health check passed');
          }
        } catch (err) {
          logger.warn({ workerId: worker.id, err: (err as Error).message }, 'failed to establish agent tunnel (SSH connected but agent unreachable)');
        }
      }
    } catch (err) {
      logger.error({ workerId: worker.id, err }, 'failed to connect to remote worker');
      this.repo.updateWorkerStatus(worker.id, 'error');
      throw err;
    }
  }

  disconnectWorker(workerId: string): void {
    logger.info({ workerId }, 'disconnecting worker');
    this.agentTunnelManager.disconnect(workerId);
    this.tunnelManager.disconnect(workerId);
    this.repo.updateWorkerStatus(workerId, 'disconnected');
  }

  async testConnection(worker: Worker): Promise<{ ok: boolean; latency_ms: number; error?: string; claudeAvailable?: boolean; claudeVersion?: string }> {
    if (worker.type === 'local') {
      return { ok: true, latency_ms: 0 };
    }

    const start = Date.now();

    // If not connected, attempt to establish connection first
    if (!this.tunnelManager.isConnected(worker.id)) {
      try {
        await this.connectWorker(worker);
      } catch (err) {
        const latency = Date.now() - start;
        const message = err instanceof Error ? err.message : 'SSH connection failed';
        logger.warn({ workerId: worker.id, latency_ms: latency, err }, 'worker connection test failed during connect');
        return { ok: false, latency_ms: latency, error: message };
      }
    }

    try {
      // Test SSH connectivity
      await this.tunnelManager.exec(worker.id, 'echo ok');

      // Check if Claude CLI is installed
      let claudeAvailable = false;
      let claudeVersion = '';
      try {
        // Use bash login shell to load PATH from .bashrc/.bash_profile
        const versionOutput = await this.tunnelManager.exec(worker.id, 'bash -l -c "claude --version 2>&1"');
        // Check if command was found (not "command not found" or similar errors)
        if (versionOutput.includes('command not found') || versionOutput.includes('not found')) {
          claudeAvailable = false;
          claudeVersion = 'Not installed';
        } else {
          claudeAvailable = true;
          claudeVersion = versionOutput.trim();
        }
      } catch {
        // Claude not found
        claudeAvailable = false;
        claudeVersion = 'Not installed';
      }

      const latency = Date.now() - start;

      if (!claudeAvailable) {
        logger.warn({ workerId: worker.id, latency_ms: latency }, 'SSH connected but Claude CLI not found');
        return {
          ok: false,
          latency_ms: latency,
          error: 'Claude CLI not found on remote server',
          claudeAvailable: false
        };
      }

      logger.info({ workerId: worker.id, latency_ms: latency, claudeVersion }, 'worker health check passed');
      return { ok: true, latency_ms: latency, claudeAvailable: true, claudeVersion };
    } catch (err) {
      const latency = Date.now() - start;
      const message = err instanceof Error ? err.message : 'SSH exec failed';
      logger.warn({ workerId: worker.id, latency_ms: latency, err }, 'worker health check failed');
      return { ok: false, latency_ms: latency, error: message };
    }
  }

  getWorkerClient(): WorkerClient {
    return this.workerClient;
  }

  getTunnelManager(): TunnelManager {
    return this.tunnelManager;
  }

  getAgentTunnelManager(): AgentTunnelManager {
    return this.agentTunnelManager;
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

    // Must listen for 'error' — unhandled EventEmitter errors crash the process
    this.tunnelManager.on('error', (workerId: string, err: Error) => {
      logger.warn({ workerId, err: err.message }, 'tunnel error');
      this.repo.updateWorkerStatus(workerId, 'error');
    });
  }

  destroy(): void {
    this.stopHealthCheck();
    this.agentTunnelManager.destroy();
    this.tunnelManager.destroy();
  }
}
