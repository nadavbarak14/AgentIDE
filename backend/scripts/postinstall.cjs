#!/usr/bin/env node

/**
 * Postinstall script — runs after `npm install -g adyx-ide`.
 * Checks for required system dependencies, fixes node-pty spawn-helper
 * permissions (npm strips +x on pack/install), and verifies node-pty
 * can actually spawn a process.
 * Exits non-zero only if node-pty spawn is broken after attempted fix.
 */

const { execSync, spawnSync } = require('child_process');
const { readFileSync, chmodSync, existsSync, statSync } = require('fs');
const path = require('path');

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

  // --- node-pty: fix permissions, then verify spawn ---
  let ptyOk = false;

  // Step 1: Fix spawn-helper permissions (npm strips +x on pack/install)
  try {
    const nodePtyDir = require.resolve('node-pty').replace(/[/\\]lib[/\\]index\.js$/, '');
    const spawnHelperPaths = [
      path.join(nodePtyDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
      path.join(nodePtyDir, 'build', 'Release', 'spawn-helper'),
    ];
    for (const p of spawnHelperPaths) {
      if (existsSync(p)) {
        const mode = statSync(p).mode;
        if (!(mode & 0o111)) {
          chmodSync(p, 0o755);
          console.log(`  spawn-helper .......... ${GREEN}fixed permissions${RESET} (ok)`);
        } else {
          console.log(`  spawn-helper .......... ${GREEN}executable${RESET} (ok)`);
        }
        break;
      }
    }
  } catch (chmodErr) {
    console.log(`  spawn-helper .......... ${YELLOW}could not fix permissions${RESET}`);
  }

  // Step 2: Verify node-pty can actually spawn a process
  try {
    const pty = require('node-pty');
    const testProc = pty.spawn(process.execPath, ['-e', 'process.exit(0)'], {
      cols: 80,
      rows: 24,
    });
    // Give it a moment to spawn, then check it didn't throw
    testProc.kill();
    ptyOk = true;
    console.log(`  node-pty .............. ${GREEN}spawn ok${RESET}`);
  } catch (spawnErr) {
    console.log(`  node-pty .............. ${RED}FAILED${RESET}`);
    console.log('');
    console.log(`${RED}${BOLD}Installation cannot continue — missing critical dependencies:${RESET}`);
    console.log('');
    console.log(`  ${RED}\u2717${RESET} node-pty failed to spawn a process: ${spawnErr.message}`);
    if (process.platform === 'darwin') {
      console.log('    Install Xcode command-line tools, then reinstall:');
      console.log('    xcode-select --install');
      console.log('    npm install -g adyx-ide');
    } else {
      console.log('    Install build tools, then reinstall:');
      console.log('    sudo apt-get install -y build-essential python3');
      console.log('    npm install -g adyx-ide');
    }
    console.log('');
    console.log(`After fixing, reinstall with: ${BOLD}npm install -g adyx-ide${RESET}`);
  }

  if (!ptyOk) {
    process.exit(1);
  }
} catch (err) {
  // Never fail the install for non-pty errors (missing tmux/gh is a warning)
  console.log('Note: Could not check system dependencies. Run `adyx doctor` to verify.');
}

process.exit(0);
