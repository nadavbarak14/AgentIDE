#!/usr/bin/env node

/**
 * Postinstall script — runs after `npm install -g adyx-ide`.
 * Checks for required system dependencies and prints warnings.
 * Plain JS (no TypeScript) so it works without a build step.
 * Always exits 0 — never fails the install, just warns.
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

try {
  const platform = detectPlatform();
  const results = DEPS.map((dep) => ({ ...dep, ...checkBinary(dep.binary, dep.versionFlag) }));

  console.log('');
  console.log(`${BOLD}Adyx Dependency Check${RESET}`);
  console.log('=====================');

  for (const r of results) {
    const dots = '.'.repeat(Math.max(1, 20 - r.name.length));
    if (r.installed) {
      console.log(`  ${r.name} ${dots} ${GREEN}v${r.version}${RESET} (ok)`);
    } else {
      console.log(`  ${r.name} ${dots} ${RED}MISSING${RESET}`);
    }
  }

  const missing = results.filter((r) => !r.installed);
  if (missing.length > 0) {
    console.log('');
    console.log(`${YELLOW}Missing dependencies:${RESET}`);
    for (const r of missing) {
      const instruction = r.install[platform] || 'See documentation for installation';
      console.log(`  ${r.name}: ${instruction}`);
    }
    console.log('');
    console.log('Install missing dependencies, then run: adyx doctor');
  } else {
    console.log('');
    console.log(`${GREEN}All dependencies satisfied!${RESET}`);
  }
  console.log('');

  // Check node-pty native module health
  try {
    require('node-pty');
    console.log(`  node-pty native module .. ${GREEN}loaded${RESET} (ok)`);
  } catch (ptyErr) {
    console.log(`  node-pty native module .. ${RED}FAILED${RESET}`);
    console.log('');
    console.log(`${YELLOW}Warning: node-pty native module failed to load: ${ptyErr.message}${RESET}`);
    console.log('  Terminal session support requires a working native module.');
    console.log('');
    if (process.platform === 'darwin') {
      console.log('  On macOS: Install Xcode command-line tools:');
      console.log('    xcode-select --install');
    } else {
      console.log('  On Linux: Install build tools:');
      console.log('    sudo apt-get install -y build-essential python3');
    }
    console.log('');
    console.log('  Then reinstall: npm install -g adyx-ide');
  }
} catch (err) {
  // Never fail the install
  console.log('Note: Could not check system dependencies. Run `adyx doctor` to verify.');
}

process.exit(0);
