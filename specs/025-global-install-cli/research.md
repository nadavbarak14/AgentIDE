# Research: Global Install & CLI Commands

**Feature**: 025-global-install-cli
**Date**: 2026-03-06

## R1: npm postinstall best practices

**Decision**: Use a lightweight JS postinstall script that checks for binaries and prints colored instructions. No auto-sudo.

**Rationale**: npm postinstall scripts run as the installing user (not root). Running sudo inside postinstall is fragile — it hangs in CI, breaks on systems without sudo, and surprises users. The npm ecosystem convention (e.g., husky, sharp) is to print warnings/instructions. The script must be plain JS (not TypeScript) since it runs before the project's build step.

**Alternatives considered**:
- Auto-install with sudo prompt: Rejected — hangs in non-interactive environments, security risk
- Skip postinstall entirely, only check at launch: Rejected — delays feedback; user may not understand why `adyx start` fails

## R2: Cross-platform dependency detection

**Decision**: Use `child_process.execSync` with `which` (Unix) / `where` (Windows) to detect binaries, and parse `--version` output for version info.

**Rationale**: Simple, no extra dependencies. Works on all target platforms. `which tmux` returns exit code 0 if found, non-zero if missing. Same for `gh --version`.

**Alternatives considered**:
- Use `command -v` (bash built-in): Works but not available in all shells (fish, zsh may differ)
- Use a dependency like `which` npm package: Unnecessary extra dependency for a simple check

## R3: Platform-specific install instructions

**Decision**: Detect platform via `process.platform` and `os.release()`. Map to package manager commands:

| Platform | tmux | GitHub CLI |
|----------|------|------------|
| Ubuntu/Debian | `sudo apt install tmux` | `sudo apt install gh` (after adding GitHub apt repo) |
| RHEL/CentOS/Fedora | `sudo dnf install tmux` | `sudo dnf install gh` (after adding GitHub rpm repo) |
| macOS | `brew install tmux` | `brew install gh` |
| Windows | "Please use WSL" | "Please use WSL" |

**Rationale**: These are the official installation methods documented by each tool's maintainers. Detecting distro on Linux uses `/etc/os-release` which is standard on all modern distros.

**Alternatives considered**:
- Snap packages: Available but not universally installed; apt/dnf is more reliable
- Building from source: Too complex for a postinstall check

## R4: Browser auto-open approach

**Decision**: Use the `open` npm package (already widely used, cross-platform) to open the default browser after the hub starts listening.

**Rationale**: `open` handles macOS (`open`), Linux (`xdg-open`), and WSL correctly. It's a small, well-maintained package with no dependencies. The `--no-open` flag will skip this step.

**Alternatives considered**:
- `child_process.exec('xdg-open ...')` directly: Platform-specific, requires manual handling per OS
- No auto-open: Rejected — user explicitly requested this behavior

## R5: Existing CLI architecture

**Decision**: Extend the existing `backend/src/cli.ts` which already uses `commander` and has `adyx start`. Add `agent` and `doctor` subcommands in the same file.

**Rationale**: The CLI is small (one file, ~40 lines). Adding two more commands keeps it simple. No need for a plugin system or separate command files at this scale.

**Alternatives considered**:
- Separate command files (commands/start.ts, commands/agent.ts): Over-engineering for 3 commands
- Using yargs or oclif: Unnecessary migration — commander is already in use and sufficient
