# Implementation Plan: IDE Panels

**Branch**: `002-ide-panels` | **Date**: 2026-02-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ide-panels/spec.md`

## Summary

Transform the single-session (1-view) display mode from a terminal-only view into an IDE-like workspace with contextual side panels. Three panel types — File Explorer (browse and view project files with Monaco Editor), Git Changes (split-view diffs with inline commenting that injects feedback into the Claude Code session), and Web Preview (embedded iframe for dev server output) — slide open beside the terminal. Panel state (which panel is open, open file tabs, scroll positions, preview URL) persists per session across session switches and browser refreshes via SQLite storage. The feature builds on existing backend infrastructure (file reading, git diffs, file watching, port scanning) and upgrades frontend components (FileTree, FileViewer, DiffViewer, LivePreview) from stubs to fully functional IDE panels.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, React 18, Vite 6, better-sqlite3, xterm.js 5, @monaco-editor/react 4.6, diff2html 3.4, chokidar 4, ws 8, Tailwind CSS 3
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database
**Testing**: Vitest 2.1 (unit + integration), Playwright (system/E2E)
**Target Platform**: Linux server (backend), modern browsers (frontend)
**Project Type**: Web application (backend + frontend monorepo with npm workspaces)
**Performance Goals**: File viewer loads in <2s, file tree updates within 2s of FS change, diff renders in <3s for 500 modified lines, panel state restore is instant on session switch
**Constraints**: Files >1MB truncated in viewer, lazy-loaded directory tree for projects with thousands of files, single SQLite database for all persistence
**Scale/Scope**: Single user dashboard, up to 10 concurrent sessions, projects up to 10k files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Plan includes unit tests for all new backend logic (panel state CRUD, comment CRUD, comment delivery), unit tests for new frontend hooks and component behavior, integration tests for API endpoints, and system tests for end-to-end panel workflows |
| II. UX-First Design | PASS | Spec defines complete user scenarios (P1-P4) with acceptance criteria. Panel layout follows standard IDE conventions (VS Code-style side panel). Comment workflow mirrors GitHub PR review UX |
| III. UI Quality & Consistency | PASS | Panels use existing Tailwind design system, Monaco Editor matches dashboard theme (dark/light), consistent toolbar placement, resizable split pane with drag handle |
| IV. Simplicity | PASS | Leverages existing backend infrastructure (file reader, git operations, file watcher, port scanner). No new services or abstractions — extends existing Repository with new table methods. Frontend upgrades existing stub components rather than creating new ones |
| V. CI/CD Pipeline | PASS | Feature developed on branch, will PR to main. Existing CI pipeline runs tests + lint + typecheck |
| VI. Frontend Plugin Quality | PASS | Monaco Editor (already a dependency, Microsoft-maintained), diff2html (already a dependency). No new frontend plugins required |
| VII. Backend Security | PASS | Path sanitization already exists in file-reader.ts. Comment filePath validated against path traversal. Panel state is session-scoped, no cross-session access |
| VIII. Observability & Logging | PASS | New endpoints will use existing Pino logger with session-scoped context. Comment delivery logged as INFO events |

### Post-Phase 1 Gate (re-evaluation)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Data model has clear query patterns suitable for unit testing. API contracts define request/response shapes for integration tests. Comment delivery flow testable with real PTY |
| IV. Simplicity | PASS | Two new tables (panel_states, comments), four new API endpoints, one new hook (usePanel). No new abstractions, no new services — extends existing patterns |
| VII. Backend Security | PASS | Comment text is injected as PTY input (same as user typing). No shell injection risk — PTY stdin handles arbitrary text safely. File paths validated before use |

## Project Structure

### Documentation (this feature)

```text
specs/002-ide-panels/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: database schema additions
├── quickstart.md        # Phase 1: developer setup guide
├── contracts/
│   └── api.md           # Phase 1: API endpoint contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   └── sessions.ts          # Extended: panel-state + comments endpoints
│   │   └── middleware.ts            # Unchanged (reuse validation)
│   ├── models/
│   │   ├── db.ts                    # Extended: panel_states + comments tables
│   │   ├── types.ts                 # Extended: PanelState + Comment interfaces
│   │   └── repository.ts           # Extended: panel state + comment CRUD
│   ├── services/
│   │   └── session-manager.ts      # Extended: deliver pending comments on activate
│   └── worker/
│       ├── file-reader.ts           # Unchanged (already supports 1MB limit, lang detection)
│       ├── file-watcher.ts          # Unchanged (already emits file_changed events)
│       └── git-operations.ts        # Unchanged (already returns diff + stats)
├── tests/
│   ├── unit/
│   │   ├── panel-state.test.ts      # New: panel state repository tests
│   │   └── comments.test.ts         # New: comment repository + delivery tests
│   └── integration/
│       └── ide-panels.test.ts       # New: API endpoint integration tests
│
frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx          # Modified: split layout, toolbar visibility, panel container
│   │   ├── SessionGrid.tsx          # Modified: pass isSingleView prop
│   │   ├── FileTree.tsx             # Modified: lazy loading, search filter, live updates
│   │   ├── FileViewer.tsx           # Modified: Monaco Editor, tabbed UI, live reload
│   │   ├── DiffViewer.tsx           # Modified: line selection, comment UI, status tracking
│   │   └── LivePreview.tsx          # Modified: auto-detect, URL input, open-in-tab fallback
│   ├── hooks/
│   │   └── usePanel.ts              # New: panel state management + persistence
│   └── services/
│       └── api.ts                   # Extended: panel state + comment API methods
├── tests/
│   ├── unit/
│   │   ├── usePanel.test.ts         # New: panel state hook tests
│   │   ├── FileViewer.test.tsx      # New: Monaco, tabs, live reload
│   │   └── DiffViewer.test.tsx      # New: line selection, comment UI
│   └── system/
│       └── ide-panels.test.ts       # New: E2E panel workflows
```

**Structure Decision**: Follows the existing web application structure (backend/ + frontend/ workspaces). No new directories created — all changes fit within existing directory layout. New files are limited to test files and one new hook (usePanel.ts).

## Complexity Tracking

No constitution violations. All design decisions align with simplicity:
- Extends existing tables and repository rather than introducing new services
- Reuses existing backend infrastructure (file reader, git ops, file watcher) without modification
- Upgrades existing frontend component stubs rather than creating new components
- One new custom hook (usePanel) — follows established hook pattern (useSession, useTerminal, etc.)
