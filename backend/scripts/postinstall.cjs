#!/usr/bin/env node

/**
 * Postinstall script — runs after `npm install -g adyx-ide`.
 * Checks for required system dependencies and offers to auto-install them.
 * Plain JS (no TypeScript) so it works without a build step.
 */

const { execSync, spawnSync } = require('child_process');
const { readFileSync, createWriteStream, existsSync, statSync, chmodSync } = require('fs');
const path = require('path');
const readline = require('readline');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
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

function hasSudo() {
  try {
    execSync('which sudo', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isRoot() {
  return process.getuid && process.getuid() === 0;
}

const DEPS = [
  {
    name: 'tmux',
    binary: 'tmux',
    versionFlag: '-V',
    required: true,
    autoInstall: {
      ubuntu: 'apt-get install -y tmux',
      rhel: 'dnf install -y tmux',
      macos: 'brew install tmux',
    },
    manualInstall: {
      ubuntu: 'sudo apt-get install -y tmux',
      rhel: 'sudo dnf install -y tmux',
      macos: 'brew install tmux',
      windows: 'Install WSL then: sudo apt-get install -y tmux',
    },
  },
  {
    name: 'GitHub CLI',
    binary: 'gh',
    versionFlag: '--version',
    required: false,
    autoInstall: {
      ubuntu: null, // gh requires adding a repo, skip auto
      rhel: null,
      macos: 'brew install gh',
    },
    manualInstall: {
      ubuntu: 'See https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
      rhel: 'See https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
      macos: 'brew install gh',
      windows: 'See https://cli.github.com/',
    },
  },
  {
    name: 'Chrome/Chromium',
    binary: null, // checked specially
    versionFlag: '--version',
    required: false,
    chromeBinaries: [
      'google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium',
      '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    ],
    autoInstall: {
      ubuntu: 'apt-get install -y chromium-browser || apt-get install -y chromium',
      rhel: 'dnf install -y chromium',
      macos: null, // Use brew cask, complex
    },
    manualInstall: {
      ubuntu: 'sudo apt-get install -y chromium-browser',
      rhel: 'sudo dnf install -y chromium',
      macos: 'brew install --cask google-chrome',
      windows: 'Download from https://www.google.com/chrome/',
    },
  },
  {
    name: 'ffmpeg',
    binary: 'ffmpeg',
    versionFlag: '-version',
    required: false,
    autoInstall: {
      ubuntu: 'apt-get install -y ffmpeg',
      rhel: 'dnf install -y ffmpeg',
      macos: 'brew install ffmpeg',
    },
    manualInstall: {
      ubuntu: 'sudo apt-get install -y ffmpeg',
      rhel: 'sudo dnf install -y ffmpeg',
      macos: 'brew install ffmpeg',
      windows: 'Download from https://ffmpeg.org/download.html',
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

function checkChrome(dep) {
  for (const bin of dep.chromeBinaries) {
    const result = checkBinary(bin, dep.versionFlag);
    if (result.installed) {
      return { installed: true, version: result.version, foundBinary: bin };
    }
  }
  return { installed: false, version: null, foundBinary: null };
}

function testNodePtySpawn() {
  try {
    const ptyModule = require('node-pty');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const proc = ptyModule.spawn(shell, ['-c', 'echo pty_ok'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
    });
    proc.kill();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function tryAutoInstall(dep, platform) {
  const cmd = dep.autoInstall && dep.autoInstall[platform];
  if (!cmd) return false;

  const fullCmd = isRoot() ? cmd : (hasSudo() ? `sudo ${cmd}` : null);
  if (!fullCmd) return false;

  console.log(`  ${CYAN}→ Auto-installing ${dep.name}...${RESET}`);
  console.log(`    ${DIM}$ ${fullCmd}${RESET}`);

  try {
    execSync(fullCmd, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return true;
  } catch (err) {
    console.log(`    ${YELLOW}Auto-install failed: ${err.message.split('\n')[0]}${RESET}`);
    return false;
  }
}

try {
  const platform = detectPlatform();
  const errors = [];
  const warnings = [];

  console.log('');
  console.log(`${BOLD}Adyx Dependency Check${RESET}`);
  console.log('=====================');

  for (const dep of DEPS) {
    let result;
    if (dep.chromeBinaries) {
      result = checkChrome(dep);
    } else if (dep.binary) {
      result = checkBinary(dep.binary, dep.versionFlag);
    } else {
      continue;
    }

    const dots = '.'.repeat(Math.max(1, 20 - dep.name.length));

    if (result.installed) {
      console.log(`  ${dep.name} ${dots} ${GREEN}v${result.version}${RESET} (ok)`);
    } else {
      // Try auto-install for missing deps
      const autoInstalled = tryAutoInstall(dep, platform);

      if (autoInstalled) {
        // Re-check after install
        let recheck;
        if (dep.chromeBinaries) {
          recheck = checkChrome(dep);
        } else {
          recheck = checkBinary(dep.binary, dep.versionFlag);
        }
        if (recheck.installed) {
          console.log(`  ${dep.name} ${dots} ${GREEN}v${recheck.version}${RESET} (auto-installed)`);
          continue;
        }
      }

      // Still missing
      if (dep.required) {
        console.log(`  ${dep.name} ${dots} ${RED}MISSING${RESET}`);
        const instruction = (dep.manualInstall && dep.manualInstall[platform]) || 'See documentation';
        errors.push(`${dep.name} is required. Install with:\n    ${instruction}`);
      } else {
        console.log(`  ${dep.name} ${dots} ${YELLOW}MISSING (optional)${RESET}`);
        const instruction = (dep.manualInstall && dep.manualInstall[platform]) || 'See documentation';
        warnings.push(`${dep.name} (optional): ${instruction}`);
      }
    }
  }

  // Fix node-pty spawn-helper permissions (npm strips +x on pack/install)
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
          console.log(`  spawn-helper .......... ${GREEN}fixed permissions${RESET}`);
        }
        break;
      }
    }
  } catch (_chmodErr) {
    // Best effort
  }

  // Fix skill and hook script permissions (npm strips +x on pack/install)
  try {
    const packageRoot = path.resolve(__dirname, '..');
    const dirsToFix = [
      path.join(packageRoot, '.claude-skills', 'skills'),
      path.join(packageRoot, 'extensions'),
      path.join(packageRoot, 'backend', 'hooks'),
    ];
    let fixedCount = 0;
    function fixShellScripts(dir) {
      if (!existsSync(dir)) return;
      const entries = require('fs').readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          fixShellScripts(full);
        } else if (entry.isFile() && entry.name.endsWith('.sh')) {
          try {
            const mode = statSync(full).mode;
            if (!(mode & 0o111)) {
              chmodSync(full, 0o755);
              fixedCount++;
            }
          } catch {}
        }
      }
    }
    for (const d of dirsToFix) fixShellScripts(d);
    if (fixedCount > 0) {
      console.log(`  skill scripts ......... ${GREEN}fixed ${fixedCount} file(s)${RESET}`);
    }
  } catch (_chmodErr) {
    // Best effort
  }

  // Test node-pty
  const ptyResult = testNodePtySpawn();
  if (ptyResult.ok) {
    console.log(`  node-pty ${'.'.repeat(13)} ${GREEN}working${RESET} (ok)`);
  } else {
    console.log(`  node-pty ${'.'.repeat(13)} ${RED}FAILED${RESET}`);
    let fix;
    if (process.platform === 'darwin') {
      fix = `Install Xcode command-line tools, then reinstall:\n    xcode-select --install\n    npm install -g adyx-ide`;
    } else {
      // Try auto-installing build tools
      let autoFixed = false;
      if (platform === 'ubuntu') {
        console.log(`  ${CYAN}→ Auto-installing build tools...${RESET}`);
        const buildCmd = isRoot()
          ? 'apt-get install -y build-essential python3'
          : (hasSudo() ? 'sudo apt-get install -y build-essential python3' : null);
        if (buildCmd) {
          try {
            execSync(buildCmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 });
            // Rebuild node-pty
            console.log(`  ${CYAN}→ Rebuilding node-pty...${RESET}`);
            execSync('npm rebuild node-pty', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 });
            const recheck = testNodePtySpawn();
            if (recheck.ok) {
              console.log(`  node-pty ${'.'.repeat(13)} ${GREEN}working${RESET} (auto-fixed)`);
              autoFixed = true;
            }
          } catch {}
        }
      }
      if (!autoFixed) {
        fix = `Install build tools, then reinstall:\n    sudo apt-get install -y build-essential python3\n    npm install -g adyx-ide`;
        errors.push(`node-pty failed to spawn: ${ptyResult.error}\n    ${fix}`);
      }
    }
  }

  console.log('');

  if (warnings.length > 0) {
    console.log(`${YELLOW}Optional dependencies (some features may be limited):${RESET}`);
    for (const w of warnings) {
      console.log(`  ${YELLOW}!${RESET} ${w}`);
    }
    console.log('');
  }

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
