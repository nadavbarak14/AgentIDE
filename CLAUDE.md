# ClaudeQueue Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-17

## Active Technologies
- TypeScript 5.7, Node.js 20 LTS + Express 4, React 18, Vite 6, better-sqlite3, xterm.js 5, @monaco-editor/react 4.6, diff2html 3.4, chokidar 4, ws 8, Tailwind CSS 3 (002-ide-panels)
- SQLite (better-sqlite3) with WAL mode — existing `c3.db` database (002-ide-panels)
- TypeScript 5.7, Node.js 20 LTS + React 18, Tailwind CSS 3, Monaco Editor (@monaco-editor/react 4.6), xterm.js 5, Express 4, ws, chokidar, diff2html, better-sqlite3 (002-ide-panels)
- TypeScript 5.7, Node.js 20 LTS + React 18, Tailwind CSS 3, Vite 6, @monaco-editor/react, xterm.js 5 (002-ide-panels)
- SQLite via better-sqlite3 (existing — no schema changes) (002-ide-panels)
- TypeScript 5.x, Node.js 20 LTS + React 18, Monaco Editor, xterm.js 5, Express 4, better-sqlite3 (002-ide-panels)
- SQLite (existing panel_states table) (002-ide-panels)
- SQLite (better-sqlite3) — no schema changes in v5 (002-ide-panels)
- SQLite (better-sqlite3) — no schema changes in v6 (002-ide-panels)
- TypeScript 5.x, Node.js 20 LTS + React 18, Tailwind CSS 3, Express, SQLite (better-sqlite3) (002-ide-panels)
- SQLite (comments table already exists) (002-ide-panels)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, @monaco-editor/react 4.6, xterm.js 5, better-sqlite3, Tailwind CSS 3, Vite 6 (003-multy-ux)
- SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, no schema changes (003-multy-ux)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, @monaco-editor/react 4.6, diff2html 3.4, Tailwind CSS 3, better-sqlite3 (004-ux-polish)
- SQLite (better-sqlite3) with WAL mode — existing `comments` table, no schema changes (004-ux-polish)
- TypeScript 5.7, Node.js 20 LTS + React 18, Tailwind CSS 3, @monaco-editor/react 4.6, diff2html 3.4, Express 4, better-sqlite3 (004-ux-polish)
- TypeScript 5.7, Node.js 20 LTS + React 18, Tailwind CSS 3, @monaco-editor/react 4.6 (Monaco view zones), diff2html 3.4, Express 4, better-sqlite3 (004-ux-polish)
- SQLite (better-sqlite3) — one schema change: `ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'` (004-ux-polish)
- TypeScript 5.7, Node.js 20 LTS + Vitest 2.1.0, React 18, Express 4, better-sqlite3, supertest, @testing-library/react, @testing-library/jest-dom, ws 8 (005-testing-ci)
- SQLite (better-sqlite3) with WAL mode — no schema changes (005-testing-ci)
- TypeScript 5.7, Node.js 20 LTS + React 18, @monaco-editor/react 4.6, xterm.js 5, Express 4, better-sqlite3, Tailwind CSS 3, Vite 6, diff2html 3.4, chokidar 4, ws 8 (006-ide-workspace)
- SQLite (better-sqlite3) with WAL mode — existing `panel_states` table (JSON blob), no schema migration needed (006-ide-workspace)
- TypeScript 5.7, Node.js 20 LTS + Express 4, jose (JWT), commander (CLI), cookie-parser, express-rate-limit, selfsigned (TLS) (007-auth-licensing-cli)
- SQLite (better-sqlite3) — existing `c3.db`, one new table: `auth_config` (007-auth-licensing-cli)
- TypeScript 5.7, Node.js 20 LTS + Express 4, `jose` (JWT), `commander` (CLI), `express-rate-limit`, `selfsigned` (TLS), `ssh2` (workers), `ws` (WebSocket), `better-sqlite3` (009-product-security-licensing)
- SQLite via better-sqlite3 — `auth_config` table (singleton) stores JWT secret and cached license metadata (009-product-security-licensing)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, @monaco-editor/react 4.6, xterm.js 5, better-sqlite3, ws 8, Tailwind CSS 3, Vite 6 (007-ide-ux-skills)
- SQLite (better-sqlite3) with WAL mode — no schema changes needed (007-ide-ux-skills)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Vite 6, xterm.js 5, @monaco-editor/react 4.6, diff2html 3.4, better-sqlite3, ws 8, chokidar 4, Tailwind CSS 3 (007-ide-ux-skills)

- TypeScript 5.x, Node.js 20 LTS + React 18, Tailwind CSS 3, xterm.js 5, Monaco Editor, Express, node-pty, ssh2, chokidar, diff2html, ws (001-c3-dashboard)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x, Node.js 20 LTS: Follow standard conventions

## Recent Changes
- 009-product-security-licensing: Added TypeScript 5.7, Node.js 20 LTS + Express 4, `jose` (JWT), `commander` (CLI), `express-rate-limit`, `selfsigned` (TLS), `ssh2` (workers), `ws` (WebSocket), `better-sqlite3`
- 007-auth-licensing-cli: Added TypeScript 5.7, Node.js 20 LTS + Express 4, jose (JWT), commander (CLI), cookie-parser, express-rate-limit, selfsigned (TLS)
- 007-ide-ux-skills: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Vite 6, xterm.js 5, @monaco-editor/react 4.6, diff2html 3.4, better-sqlite3, ws 8, chokidar 4, Tailwind CSS 3
- 007-ide-ux-skills: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, @monaco-editor/react 4.6, xterm.js 5, better-sqlite3, ws 8, Tailwind CSS 3, Vite 6
- 006-ide-workspace: Added TypeScript 5.7, Node.js 20 LTS + React 18, @monaco-editor/react 4.6, xterm.js 5, Express 4, better-sqlite3, Tailwind CSS 3, Vite 6, diff2html 3.4, chokidar 4, ws 8


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
