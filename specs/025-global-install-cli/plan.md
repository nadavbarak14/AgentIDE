# Implementation Plan: Global Install & CLI Commands

**Branch**: `025-global-install-cli` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-global-install-cli/spec.md`

## Summary

Extend the existing `adyx` CLI with an `agent` subcommand for remote agent startup, add a `doctor` subcommand for dependency health checks, implement a postinstall dependency checker, add pre-flight checks at launch, and auto-open the browser on `adyx start`. The CLI is already globally installable via the `bin` field in package.json — this feature completes the experience by ensuring dependencies are present and commands are discoverable.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: commander (CLI framework, already in use), open (browser launcher)
**Storage**: N/A — no database changes
**Testing**: Vitest 2.1.0 (unit + system tests)
**Target Platform**: Linux (Ubuntu/Debian, RHEL/CentOS), macOS, Windows (WSL only)
**Project Type**: web (existing monorepo: backend/ + frontend/)
**Performance Goals**: CLI startup < 500ms, dependency check < 5s
**Constraints**: No auto-sudo in postinstall; print instructions only
**Scale/Scope**: 3 CLI commands (start, agent, doctor), 1 postinstall script, pre-flight checks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for dependency checker, system tests for CLI commands |
| II. UX-First Design | PASS | Simple CLI commands, auto-open browser, clear dependency instructions |
| III. UI Quality & Consistency | N/A | CLI-only feature, no visual UI |
| IV. Simplicity | PASS | Extending existing CLI, minimal new code, no new abstractions |
| V. CI/CD Pipeline | PASS | Standard branch/PR/CI workflow |
| VI. Frontend Plugin Quality | N/A | No frontend changes |
| VII. Backend Security | PASS | No user input handling beyond CLI args (validated by commander) |
| VIII. Observability & Logging | PASS | CLI outputs status messages; hub/agent already have logging |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/025-global-install-cli/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A — no API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── cli.ts                    # MODIFY — add agent, doctor commands; auto-open browser
│   ├── hub-entry.ts              # MINOR — ensure startHub returns server URL for open
│   ├── remote-agent-entry.ts     # MINOR — add startAgent export for CLI
│   └── utils/
│       └── dependency-checker.ts # NEW — check/report tmux, gh status per platform
├── scripts/
│   └── postinstall.js            # NEW — runs dependency-checker after npm install -g
└── tests/
    ├── unit/
    │   └── dependency-checker.test.ts  # NEW
    └── system/
        └── cli.test.ts                 # NEW — test CLI commands end-to-end

package.json                       # MODIFY — add postinstall script, add "open" dependency
```

**Structure Decision**: Extends existing backend/src/ layout. New `dependency-checker.ts` utility in a `utils/` directory. Postinstall script at `backend/scripts/postinstall.js` (plain JS for portability — runs before TypeScript is available).

## Complexity Tracking

No constitution violations. No complexity justifications needed.
