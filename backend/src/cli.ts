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
  .name('agentide')
  .description('AgentIDE — Multi-session Claude Code command center')
  .version(getVersion());

// agentide start
program
  .command('start')
  .description('Start the AgentIDE hub server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-H, --host <host>', 'Host to bind to (use 0.0.0.0 for remote access)', '127.0.0.1')
  .option('--tls', 'Enable HTTPS/TLS', false)
  .option('--cert <path>', 'Path to TLS certificate file')
  .option('--key <path>', 'Path to TLS private key file')
  .option('--self-signed', 'Generate and use a self-signed TLS certificate', false)
  .option('--no-auth', 'Disable authentication even in remote mode')
  .action(async (opts) => {
    const { startHub } = await import('./hub-entry.js');
    await startHub({
      port: parseInt(opts.port, 10),
      host: opts.host,
      tls: opts.tls || opts.selfSigned || !!(opts.cert && opts.key),
      certPath: opts.cert,
      keyPath: opts.key,
      selfSigned: opts.selfSigned,
      noAuth: !opts.auth, // --no-auth sets opts.auth to false
    });
  });

// agentide activate <license-key>
program
  .command('activate <license-key>')
  .description('Activate a license key')
  .action(async (licenseKey: string) => {
    const { validateLicense, saveLicenseToDisk } = await import('./auth/license.js');

    const result = validateLicense(licenseKey);
    if (!result.valid || !result.payload) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    saveLicenseToDisk(licenseKey);

    console.log(`License activated for ${result.payload.email}`);
    console.log(`Plan: ${result.payload.plan} | Max Sessions: ${result.payload.maxSessions}`);
    console.log(`Expires: ${result.payload.expiresAt}`);
  });

program.parse();
