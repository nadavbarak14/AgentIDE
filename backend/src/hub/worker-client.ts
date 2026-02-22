import type { TunnelManager } from './tunnel.js';
import { createWorkerLogger } from '../services/logger.js';

export class WorkerClient {
  constructor(private tunnelManager: TunnelManager) {}

  async sendCommand(workerId: string, command: Record<string, unknown>): Promise<string> {
    const log = createWorkerLogger(workerId);
    const json = JSON.stringify(command);
    log.info({ cmd: command.cmd }, 'sending command to worker');
    return this.tunnelManager.exec(workerId, `echo '${json}' | node dist/worker-entry.js`);
  }

  async spawn(workerId: string, sessionId: string, directory: string): Promise<void> {
    await this.sendCommand(workerId, { cmd: 'spawn', sessionId, directory });
  }

  async sendInput(workerId: string, sessionId: string, data: string): Promise<void> {
    await this.sendCommand(workerId, { cmd: 'input', sessionId, data });
  }

  async kill(workerId: string, sessionId: string): Promise<void> {
    await this.sendCommand(workerId, { cmd: 'kill', sessionId });
  }
}
