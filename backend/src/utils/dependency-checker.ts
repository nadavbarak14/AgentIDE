import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// --- Types ---

export type Platform = 'ubuntu' | 'rhel' | 'macos' | 'windows' | 'unknown';

export interface SystemDependency {
  name: string;
  binary: string;
  versionFlag: string;
  required: boolean;
  installInstructions: Partial<Record<Platform, string>>;
}

export interface DependencyCheckResult {
  dependency: SystemDependency;
  installed: boolean;
  version: string | null;
}

// --- Platform detection ---

export function detectPlatform(): Platform {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  if (process.platform !== 'linux') return 'unknown';

  try {
    const osRelease = readFileSync('/etc/os-release', 'utf-8').toLowerCase();
    if (osRelease.includes('ubuntu') || osRelease.includes('debian')) return 'ubuntu';
    if (osRelease.includes('rhel') || osRelease.includes('centos') || osRelease.includes('fedora') || osRelease.includes('rocky') || osRelease.includes('alma')) return 'rhel';
  } catch {
    // /etc/os-release not available
  }
  return 'ubuntu'; // Default to ubuntu for unknown linux
}

// --- Dependency checking ---

export function checkDependency(dep: SystemDependency): DependencyCheckResult {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whichCmd} ${dep.binary}`, { stdio: 'pipe' });
  } catch {
    return { dependency: dep, installed: false, version: null };
  }

  let version: string | null = null;
  try {
    const output = execSync(`${dep.binary} ${dep.versionFlag}`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
    // Extract version-like pattern from output
    const match = output.match(/(\d+\.\d+[\w.-]*)/);
    version = match ? match[1] : output.split('\n')[0];
  } catch {
    // Binary exists but version check failed
    version = 'unknown';
  }

  return { dependency: dep, installed: true, version };
}

// --- Required dependencies list ---

const REQUIRED_DEPENDENCIES: SystemDependency[] = [
  {
    name: 'tmux',
    binary: 'tmux',
    versionFlag: '-V',
    required: true,
    installInstructions: {
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
    required: true,
    installInstructions: {
      ubuntu: 'sudo apt install -y gh  (or see https://github.com/cli/cli/blob/trunk/docs/install_linux.md)',
      rhel: 'sudo dnf install -y gh  (or see https://github.com/cli/cli/blob/trunk/docs/install_linux.md)',
      macos: 'brew install gh',
      windows: 'Please install WSL and run: sudo apt install -y gh',
    },
  },
  {
    name: 'Node.js',
    binary: 'node',
    versionFlag: '--version',
    required: true,
    installInstructions: {
      ubuntu: 'See https://nodejs.org/ for installation',
      rhel: 'See https://nodejs.org/ for installation',
      macos: 'brew install node@20',
      windows: 'See https://nodejs.org/ for installation',
    },
  },
];

export function checkAllDependencies(): DependencyCheckResult[] {
  return REQUIRED_DEPENDENCIES.map((dep) => checkDependency(dep));
}

// --- Formatting ---

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function formatDependencyReport(results: DependencyCheckResult[]): string {
  const platform = detectPlatform();
  const lines: string[] = [];

  lines.push(`${BOLD}Adyx Dependency Check${RESET}`);
  lines.push('=====================');

  for (const r of results) {
    const dots = '.'.repeat(Math.max(1, 20 - r.dependency.name.length));
    if (r.installed) {
      lines.push(`  ${r.dependency.name} ${dots} ${GREEN}v${r.version}${RESET} (ok)`);
    } else {
      lines.push(`  ${r.dependency.name} ${dots} ${RED}MISSING${RESET}`);
    }
  }

  const missing = results.filter((r) => !r.installed && r.dependency.required);
  if (missing.length > 0) {
    lines.push('');
    lines.push(`${YELLOW}Missing dependencies:${RESET}`);
    for (const r of missing) {
      const instruction = r.dependency.installInstructions[platform] || 'See documentation for installation';
      lines.push(`  ${r.dependency.name}: ${instruction}`);
    }
  } else {
    lines.push('');
    lines.push(`${GREEN}All dependencies satisfied!${RESET}`);
  }

  return lines.join('\n');
}

export function runPreFlightCheck(): void {
  const results = checkAllDependencies();
  const missing = results.filter((r) => !r.installed && r.dependency.required);
  if (missing.length > 0) {
    console.log(formatDependencyReport(results));
    console.log('');
  }
}
