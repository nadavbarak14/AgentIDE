# Data Model: Global Install & CLI Commands

**Feature**: 025-global-install-cli
**Date**: 2026-03-06

## Entities

### SystemDependency

Represents a required external tool that must be present for Adyx to function.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Human-readable name (e.g., "tmux", "GitHub CLI") |
| binary | string | Binary name to check in PATH (e.g., "tmux", "gh") |
| versionFlag | string | Flag to get version (e.g., "--version", "-V") |
| minVersion | string or null | Minimum required version, null if any version is acceptable |
| required | boolean | Whether Adyx cannot function without this dependency |
| installInstructions | Map<Platform, string> | Platform-specific install commands |

### DependencyCheckResult

Result of checking a single dependency.

| Field | Type | Description |
|-------|------|-------------|
| dependency | SystemDependency | The dependency that was checked |
| installed | boolean | Whether the binary was found in PATH |
| version | string or null | Detected version string, null if not installed |
| meetsMinVersion | boolean | Whether installed version meets minimum requirement |

### Platform (enum)

- `ubuntu` — Ubuntu/Debian (apt)
- `rhel` — RHEL/CentOS/Fedora (dnf/yum)
- `macos` — macOS (brew)
- `windows` — Windows (WSL instructions)
- `unknown` — Unsupported/undetected

## Relationships

- A `SystemDependency` has one `installInstructions` entry per `Platform`
- A dependency check produces one `DependencyCheckResult` per `SystemDependency`
- No database storage — these are runtime-only structures

## State Transitions

No state machines. Dependency checking is a stateless operation:
1. Enumerate required dependencies
2. Check each one (binary exists? version ok?)
3. Report results
