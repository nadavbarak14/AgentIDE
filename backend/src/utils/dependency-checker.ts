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
  /** Alternative binaries to check (e.g., chromium-browser, chromium) */
  altBinaries?: string[];
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
  // Check primary binary
  const primary = checkSingleBinary(dep.binary, dep.versionFlag);
  if (primary.installed) return { dependency: dep, ...primary };

  // Check alternative binaries
  if (dep.altBinaries) {
    for (const alt of dep.altBinaries) {
      const result = checkSingleBinary(alt, dep.versionFlag);
      if (result.installed) return { dependency: dep, ...result };
    }
  }

  return { dependency: dep, installed: false, version: null };
}

function checkSingleBinary(binary: string, versionFlag: string): { installed: boolean; version: string | null } {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whichCmd} ${binary}`, { stdio: 'pipe' });
  } catch {
    return { installed: false, version: null };
  }

  let version: string | null = null;
  try {
    const output = execSync(`${binary} ${versionFlag}`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
    // Extract version-like pattern from output
    const match = output.match(/(\d+\.\d+[\w.-]*)/);
    version = match ? match[1] : output.split('\n')[0];
  } catch {
    // Binary exists but version check failed
    version = 'unknown';
  }

  return { installed: true, version };
}

// --- Required dependencies list ---

const REQUIRED_DEPENDENCIES: SystemDependency[] = [
  {
    name: 'tmux',
    binary: 'tmux',
    versionFlag: '-V',
    required: true,
    installInstructions: {
      ubuntu: 'sudo apt-get install -y tmux',
      rhel: 'sudo dnf install -y tmux',
      macos: 'brew install tmux',
      windows: 'Please install WSL and run: sudo apt-get install -y tmux',
    },
  },
  {
    name: 'GitHub CLI',
    binary: 'gh',
    versionFlag: '--version',
    required: false,
    installInstructions: {
      ubuntu: 'See https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
      rhel: 'See https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
      macos: 'brew install gh',
      windows: 'See https://cli.github.com/',
    },
  },
  {
    name: 'Chrome/Chromium',
    binary: 'google-chrome',
    versionFlag: '--version',
    required: false,
    altBinaries: [
      'google-chrome-stable',
      'chromium-browser',
      'chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ],
    installInstructions: {
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
    installInstructions: {
      ubuntu: 'sudo apt-get install -y ffmpeg',
      rhel: 'sudo dnf install -y ffmpeg',
      macos: 'brew install ffmpeg',
      windows: 'Download from https://ffmpeg.org/download.html',
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
    } else if (r.dependency.required) {
      lines.push(`  ${r.dependency.name} ${dots} ${RED}MISSING${RESET}`);
    } else {
      lines.push(`  ${r.dependency.name} ${dots} ${YELLOW}MISSING (optional)${RESET}`);
    }
  }

  const missing = results.filter((r) => !r.installed && r.dependency.required);
  const optional = results.filter((r) => !r.installed && !r.dependency.required);

  if (optional.length > 0) {
    lines.push('');
    lines.push(`${YELLOW}Optional dependencies (some features may be limited):${RESET}`);
    for (const r of optional) {
      const instruction = r.dependency.installInstructions[platform] || 'See documentation for installation';
      lines.push(`  ${r.dependency.name}: ${instruction}`);
    }
  }

  if (missing.length > 0) {
    lines.push('');
    lines.push(`${RED}Missing required dependencies:${RESET}`);
    for (const r of missing) {
      const instruction = r.dependency.installInstructions[platform] || 'See documentation for installation';
      lines.push(`  ${r.dependency.name}: ${instruction}`);
    }
  } else {
    lines.push('');
    lines.push(`${GREEN}All required dependencies satisfied!${RESET}`);
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
