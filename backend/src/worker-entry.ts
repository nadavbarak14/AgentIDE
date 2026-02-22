import { PtySpawner } from './worker/pty-spawner.js';
import { logger } from './services/logger.js';

/**
 * Worker mode entry point.
 * When running on a remote machine, this process listens for commands
 * over stdin (piped from SSH) and manages local PTY processes.
 *
 * For the local worker case, PtySpawner is used directly by the hub.
 * This entry point is for remote workers only.
 */
async function main() {
  const ptySpawner = new PtySpawner();

  logger.info('Multy Worker started, listening for commands on stdin');

  process.stdin.setEncoding('utf8');
  let buffer = '';

  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    // Process newline-delimited JSON commands
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const cmd = JSON.parse(line);
        handleCommand(cmd, ptySpawner);
      } catch {
        logger.error({ line }, 'failed to parse command');
      }
    }
  });

  // Forward PTY data to stdout as JSON-wrapped messages
  ptySpawner.on('data', (sessionId: string, data: string) => {
    const msg = JSON.stringify({ type: 'pty_data', sessionId, data });
    process.stdout.write(msg + '\n');
  });

  ptySpawner.on('exit', (sessionId: string, exitCode: number, claudeSessionId: string | null) => {
    const msg = JSON.stringify({ type: 'session_exit', sessionId, exitCode, claudeSessionId });
    process.stdout.write(msg + '\n');
  });

  ptySpawner.on('needs_input', (sessionId: string, pattern: string, idleSeconds: number) => {
    const msg = JSON.stringify({ type: 'needs_input', sessionId, pattern, idleSeconds });
    process.stdout.write(msg + '\n');
  });

  const shutdown = () => {
    logger.info('worker shutting down...');
    ptySpawner.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

interface WorkerCommand {
  cmd: string;
  sessionId?: string;
  directory?: string;
  claudeSessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

function handleCommand(cmd: WorkerCommand, ptySpawner: PtySpawner): void {
  switch (cmd.cmd) {
    case 'spawn':
      if (cmd.sessionId && cmd.directory) {
        ptySpawner.spawn(cmd.sessionId, cmd.directory);
      }
      break;
    case 'input':
      if (cmd.sessionId && cmd.data) {
        ptySpawner.write(cmd.sessionId, cmd.data);
      }
      break;
    case 'resize':
      if (cmd.sessionId && cmd.cols && cmd.rows) {
        ptySpawner.resize(cmd.sessionId, cmd.cols, cmd.rows);
      }
      break;
    case 'kill':
      if (cmd.sessionId) {
        ptySpawner.kill(cmd.sessionId);
      }
      break;
  }
}

main().catch((err) => {
  logger.error({ err }, 'failed to start worker');
  process.exit(1);
});
