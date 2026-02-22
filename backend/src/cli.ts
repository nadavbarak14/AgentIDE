#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('adyx')
  .description('Adyx — Multi-session Claude Code command center')
  .version(getVersion());

// adyx start
program
  .command('start')
  .description('Start the Adyx hub server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-H, --host <host>', 'Host to bind to (use 0.0.0.0 for remote access)', '127.0.0.1')
  .action(async (opts) => {
    const { startHub } = await import('./hub-entry.js');
    await startHub({
      port: parseInt(opts.port, 10),
      host: opts.host,
    });
  });

program.parse();
