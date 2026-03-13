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
  .option('-p, --port <port>', 'Port to listen on (default: 24880)', '24880')
  .option('-H, --host <host>', 'Host to bind to (default: 0.0.0.0, use 127.0.0.1 for local only)', '0.0.0.0')
  .option('--password <password>', 'Set a custom access password (replaces any existing key)')
  .option('--no-open', 'Do not auto-open the browser')
  .action(async (opts) => {
    const { runPreFlightCheck } = await import('./utils/dependency-checker.js');
    runPreFlightCheck();

    const { startHub } = await import('./hub-entry.js');
    let result;
    try {
      result = await startHub({
        port: parseInt(opts.port, 10),
        host: opts.host,
        password: opts.password,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use')) {
        process.exit(1);
      }
      console.error(`Failed to start Adyx: ${msg}`);
      process.exit(1);
    }

    // Display access key info
    if (result.accessKey) {
      console.log('');
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log('│                  ACCESS KEY GENERATED                   │');
      console.log('├─────────────────────────────────────────────────────────┤');
      console.log('│                                                         │');
      console.log(`│  ${result.accessKey}            │`);
      console.log('│                                                         │');
      console.log('│  Copy this key — it will not be shown again.            │');
      console.log('│  Paste it in the browser when accessing remotely.       │');
      console.log('│  Localhost access requires no authentication.           │');
      console.log('│                                                         │');
      console.log('└─────────────────────────────────────────────────────────┘');
      console.log('');
    } else {
      console.log('');
      console.log('  Authentication active for remote access.');
      console.log('  Localhost connections bypass authentication.');
      console.log('');
    }

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
