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
  .option('-H, --host <host>', 'Host to bind to (use 0.0.0.0 for remote access)', '0.0.0.0')
  .option('--no-open', 'Do not auto-open the browser')
  .action(async (opts) => {
    const { runPreFlightCheck } = await import('./utils/dependency-checker.js');
    runPreFlightCheck();

    const { startHub } = await import('./hub-entry.js');
    const result = await startHub({
      port: parseInt(opts.port, 10),
      host: opts.host,
    });

    if (opts.open !== false) {
      try {
        const open = (await import('open')).default;
        await open(result.url);
      } catch {
        // Browser open failed silently — not critical
      }
    }
  });

// adyx agent
program
  .command('agent')
  .description('Start the Adyx remote agent')
  .option('-p, --port <port>', 'Port to listen on', '4100')
  .option('-H, --host <host>', 'Host to bind to', '0.0.0.0')
  .action(async (opts) => {
    const { runPreFlightCheck } = await import('./utils/dependency-checker.js');
    runPreFlightCheck();

    const { startAgent } = await import('./remote-agent-entry.js');
    await startAgent({
      port: parseInt(opts.port, 10),
      host: opts.host,
    });
  });

// adyx doctor
program
  .command('doctor')
  .description('Check system dependencies required by Adyx')
  .action(async () => {
    const { checkAllDependencies, formatDependencyReport } = await import('./utils/dependency-checker.js');
    const results = checkAllDependencies();
    console.log(formatDependencyReport(results));

    const missing = results.filter((r) => !r.installed && r.dependency.required);
    process.exitCode = missing.length > 0 ? 1 : 0;
  });

program.parse();
