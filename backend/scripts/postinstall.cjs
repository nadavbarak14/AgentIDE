#!/usr/bin/env node

/**
 * Postinstall script — runs after `npm install -g adyx-ide`.
 * Checks for required system dependencies.
 * Plain JS (no TypeScript) so it works without a build step.
 * Fails the install if critical dependencies are missing (node-pty, tmux).
 */

const { execSync } = require('child_process');
const { readFileSync } = require('fs');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function detectPlatform() {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  if (process.platform !== 'linux') return 'unknown';
  try {
    const osRelease = readFileSync('/etc/os-release', 'utf-8').toLowerCase();
    if (osRelease.includes('ubuntu') || osRelease.includes('debian')) return 'ubuntu';
    if (osRelease.includes('rhel') || osRelease.includes('centos') || osRelease.includes('fedora')) return 'rhel';
  } catch {}
  return 'ubuntu';
}

const DEPS = [
  {
    name: 'tmux',
    binary: 'tmux',
    versionFlag: '-V',
    required: true,
    install: {
      ubuntu: 'sudo apt install -y tmux',
      rhel: 'sudo dnf install -y tmux',
      macos: 'brew install tmux',
      windows: 'Please install WSL and run: sudo apt install -y tmux',
    },
  },
  {
    name: 'GitHub CLI',
    binary: 'gh',
    versionFlag: '--version',
    required: false,
    install: {
      ubuntu: 'sudo apt install -y gh  (or see https://github.com/cli/cli/blob/trunk/docs/install_linux.md)',
      rhel: 'sudo dnf install -y gh  (or see https://github.com/cli/cli/blob/trunk/docs/install_linux.md)',
      macos: 'brew install gh',
      windows: 'Please install WSL and run: sudo apt install -y gh',
    },
  },
];

function checkBinary(binary, versionFlag) {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whichCmd} ${binary}`, { stdio: 'pipe' });
  } catch {
    return { installed: false, version: null };
  }
  try {
    const output = execSync(`${binary} ${versionFlag}`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
    const match = output.match(/(\d+\.\d+[\w.-]*)/);
    return { installed: true, version: match ? match[1] : output.split('\n')[0] };
  } catch {
    return { installed: true, version: 'unknown' };
  }
}

/**
 * Test that node-pty can actually spawn a process, not just load.
 * Returns { ok: true } or { ok: false, error: string }.
 */
function testNodePtySpawn() {
  try {
    const ptyModule = require('node-pty');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const proc = ptyModule.spawn(shell, ['-c', 'echo pty_ok'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
    });
    // Give it a moment then kill — we just need to confirm spawn works
    proc.kill();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

try {
  const platform = detectPlatform();
  const results = DEPS.map((dep) => ({ ...dep, ...checkBinary(dep.binary, dep.versionFlag) }));
  const errors = [];

  console.log('');
  console.log(`${BOLD}Adyx Dependency Check${RESET}`);
  console.log('=====================');

  for (const r of results) {
    const dots = '.'.repeat(Math.max(1, 20 - r.name.length));
    if (r.installed) {
      console.log(`  ${r.name} ${dots} ${GREEN}v${r.version}${RESET} (ok)`);
    } else {
      console.log(`  ${r.name} ${dots} ${RED}MISSING${RESET}`);
      if (r.required) {
        const instruction = r.install[platform] || 'See documentation for installation';
        errors.push(`${r.name} is required. Install with:\n    ${instruction}`);
      }
    }
  }

  // Test node-pty — not just loading, but actually spawning
  const ptyResult = testNodePtySpawn();
  if (ptyResult.ok) {
    console.log(`  node-pty ${'.'.repeat(13)} ${GREEN}working${RESET} (ok)`);
  } else {
    console.log(`  node-pty ${'.'.repeat(13)} ${RED}FAILED${RESET}`);
    let fix;
    if (process.platform === 'darwin') {
      fix = `Install Xcode command-line tools, then reinstall:\n    xcode-select --install\n    npm install -g adyx-ide`;
    } else {
      fix = `Install build tools, then reinstall:\n    sudo apt-get install -y build-essential python3\n    npm install -g adyx-ide`;
    }
    errors.push(`node-pty failed to spawn a process: ${ptyResult.error}\n    ${fix}`);
  }

  console.log('');

  if (errors.length > 0) {
    console.log(`${RED}${BOLD}Installation cannot continue — missing critical dependencies:${RESET}`);
    console.log('');
    for (const err of errors) {
      console.log(`  ${RED}✗${RESET} ${err}`);
      console.log('');
    }
    console.log(`After fixing, reinstall with: ${BOLD}npm install -g adyx-ide${RESET}`);
    console.log('');
    process.exit(1);
  }

  console.log(`${GREEN}All dependencies satisfied!${RESET}`);
  console.log('');
} catch (err) {
  // Never fail on unexpected errors in the check itself
  console.log('Note: Could not check system dependencies. Run `adyx doctor` to verify.');
}
