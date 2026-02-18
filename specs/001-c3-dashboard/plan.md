# Implementation Plan: C3 — Command & Control Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-c3-dashboard/spec.md`

## Summary

C3 is a distributed dashboard for managing multiple Claude Code CLI sessions across machines. A React SPA (the Hub) connects to lightweight Node.js workers via SSH tunnels, displaying a masonry grid of live terminals with IDE-like context (file trees, diffs, live previews). Sessions follow a spawn-complete-continue lifecycle: `max_sessions` limits active Claude processes, completed sessions can be resumed via `claude -c`, and a persistent queue auto-dispatches tasks to available slots.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, xterm.js 5, Monaco Editor, Express, node-pty, ssh2, chokidar, diff2html, ws
**Storage**: SQLite via better-sqlite3 (WAL mode) — queue, sessions, workers, settings
**Testing**: Vitest (unit + integration), Playwright (system/e2e), React Testing Library, Supertest
**Target Platform**: Linux/macOS workers, modern browsers (Chrome, Firefox, Safari, Edge latest 2)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: <100ms terminal streaming latency, <2s file tree load, <3s diff render, responsive UI at 60fps
**Constraints**: SSH-only networking (no public ports), all state persists across restarts
**Scale/Scope**: Single user, 1-10 workers, up to 20 concurrent sessions, projects up to 10,000 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Comprehensive Testing | PASS | Vitest (unit) + Playwright (system) with real PTY processes, real SQLite, real WebSocket connections. Mocks only for SSH to non-existent remote hosts (justified: third-party infra). See research.md Decision 8. |
| II. UX-First Design | PASS | 5 user stories defined with acceptance scenarios before implementation. Spec designed from user workflows. |
| III. UI Quality & Consistency | PASS | Tailwind CSS for consistent design language. Responsive masonry grid. Interactive states defined in spec (hover, active, disabled, loading, error). |
| IV. Simplicity | PASS | CSS Grid over masonry library. better-sqlite3 over ORM. npm workspaces over Turborepo. Worker is same codebase, different entry point. See Complexity Tracking for justified complexity. |
| V. CI/CD Pipeline | PASS | CI pipeline task included in plan. All merges via PR with rebase. |
| VI. Frontend Plugin Quality | PASS | xterm.js (5.7K stars, VS Code standard), Monaco Editor (VS Code core), diff2html (2.5M/week), Tailwind (80K stars). All actively maintained, TypeScript-first. |
| VII. Backend Security | PASS | SSH-only networking, no public ports. Input validation on all API endpoints. No secrets in logs. Key paths stored, not key contents. |
| VIII. Observability & Logging | PASS | FR-024 requires structured logging for all session lifecycle events. Pino logger with correlation IDs. |

**Post-Phase 1 Re-check**: All principles remain satisfied. The data model uses foreign keys with cascading constraints (Principle VII correctness). The WebSocket protocol separates binary terminal data from JSON control messages for clean observability.

## Project Structure

### Documentation (this feature)

```text
specs/001-c3-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entities, schema, relationships
├── quickstart.md        # Phase 1: setup and usage guide
├── contracts/
│   ├── rest-api.md      # Phase 1: REST endpoint contracts
│   └── websocket-protocol.md  # Phase 1: WebSocket message protocol
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── sessions.ts       # Session CRUD, queue management, continue
│   │   │   ├── workers.ts        # Worker CRUD + test connection
│   │   │   ├── files.ts          # File tree + content + diff
│   │   │   └── settings.ts       # Dashboard settings
│   │   ├── websocket.ts          # WebSocket handler per session
│   │   └── middleware.ts         # Validation, error handling, logging
│   ├── models/
│   │   ├── types.ts              # Shared TypeScript interfaces
│   │   ├── db.ts                 # SQLite connection + schema init
│   │   └── repository.ts         # Data access layer
│   ├── services/
│   │   ├── queue-manager.ts      # Session queue logic + auto-dispatch
│   │   ├── session-manager.ts    # Session lifecycle + claude -c + needs_input detection
│   │   ├── worker-manager.ts     # Worker connection pool
│   │   └── logger.ts             # Structured logging (Pino)
│   ├── hub/
│   │   ├── tunnel.ts             # SSH tunnel management (ssh2)
│   │   ├── worker-client.ts      # Hub-side worker communication
│   │   └── port-forwarder.ts     # Dynamic port forwarding for previews
│   ├── worker/
│   │   ├── pty-spawner.ts        # node-pty process management
│   │   ├── file-watcher.ts       # chokidar file change detection
│   │   ├── file-reader.ts        # File tree + content serving
│   │   ├── git-operations.ts     # Diff, worktree management
│   │   └── port-scanner.ts       # lsof-based port detection
│   ├── hub-entry.ts              # Hub mode entry point
│   └── worker-entry.ts           # Worker mode entry point
├── tests/
│   ├── unit/
│   │   ├── queue-manager.test.ts
│   │   ├── session-manager.test.ts
│   │   ├── repository.test.ts
│   │   └── ...
│   ├── integration/
│   │   ├── api-sessions.test.ts
│   │   ├── websocket.test.ts
│   │   └── ...
│   └── system/
│       ├── session-lifecycle.test.ts
│       └── queue-dispatch.test.ts
└── package.json

frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx        # Individual session card in grid
│   │   ├── TerminalView.tsx       # xterm.js terminal wrapper
│   │   ├── FileTree.tsx           # Read-only file explorer
│   │   ├── FileViewer.tsx         # Monaco Editor read-only viewer
│   │   ├── DiffViewer.tsx         # diff2html split-view
│   │   ├── LivePreview.tsx        # Iframe-based app preview
│   │   ├── SessionQueue.tsx        # Queue management UI (create session, reorder)
│   │   ├── WorkerList.tsx         # Worker status display
│   │   └── SessionGrid.tsx        # Focus-based session layout
│   ├── pages/
│   │   ├── Dashboard.tsx          # Main dashboard layout
│   │   └── Settings.tsx           # Settings + worker management
│   ├── hooks/
│   │   ├── useWebSocket.ts        # WebSocket connection hook
│   │   ├── useSession.ts          # Session state management
│   │   ├── useSessionQueue.ts     # Session queue polling/mutation
│   │   └── useTerminal.ts         # xterm.js lifecycle hook
│   ├── services/
│   │   ├── api.ts                 # REST API client
│   │   └── ws.ts                  # WebSocket client
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── unit/
│   │   ├── SessionCard.test.tsx
│   │   ├── SessionQueue.test.tsx
│   │   └── ...
│   └── system/
│       ├── dashboard.spec.ts      # Playwright e2e
│       └── queue-flow.spec.ts
└── package.json

package.json                       # Root workspace config
```

**Structure Decision**: Web application structure (Option 2). The backend serves both as Hub (coordinating workers) and as a local Worker (spawning Claude processes). Remote workers run the same backend binary in worker mode (`npm run start:worker`). Frontend is a separate Vite-built SPA served by the Hub.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Two entry points (hub + worker) in backend | Workers run on separate machines; they need an independent process | A single process would require the hub to directly manage PTY processes on remote machines via SSH exec for every keystroke — latency would exceed SC-002 (100ms) |
| SSH tunnel layer (ssh2) | Remote workers are accessed over SSH tunnels with no public ports (FR-017) | Direct HTTP/WebSocket connections would require opening ports on workers, violating the zero-exposed-ports security requirement |
| SQLite database | Persistent queue, session, and worker state across restarts (FR-019) | In-memory state is lost on restart; JSON files lack crash safety and concurrent read support |
