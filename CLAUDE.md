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
- TypeScript 5.7, Node.js 20 LTS + Express 4, React 18, better-sqlite3, node-pty, ws 8, Tailwind CSS 3, Vite 6 (011-resume-worktree)
- SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, one migration (add `worktree` column) (011-resume-worktree)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Vite 6, Tailwind CSS 3, xterm.js 5, better-sqlite3, ws 8, chokidar 4 (existing) + html2canvas, rrweb, rrweb-player, multer (new) (011-browser-preview)
- SQLite (better-sqlite3) with WAL mode — 3 new tables: `preview_comments`, `uploaded_images`, `video_recordings` (011-browser-preview)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Tailwind CSS 3, Vite 6, html2canvas-pro@1.5.8, better-sqlite3, ws 8 (011-browser-preview)
- SQLite (better-sqlite3) with WAL mode — existing `c3.db` database; 3 new tables (`preview_comments`, `uploaded_images`, `video_recordings`) (011-browser-preview)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, better-sqlite3, ssh2, node-pty, xterm.js 5, ws 8, Tailwind CSS 3, Vite 6 (012-session-connect-ux)
- SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, one new table (`projects`), one migration (`settings` changes) (012-session-connect-ux)
- TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, ssh2, better-sqlite3, Tailwind CSS 3 (012-session-connect-ux)
- SQLite (existing `workers` table, no schema changes needed) (012-session-connect-ux)
- TypeScript 5.7, Node.js 20 LTS + React 18, Vite 6, Tailwind CSS 3 (existing); no new dependencies (012-extension-system)
- N/A — no database changes; extension state held in React component state only (012-extension-system)
- TypeScript 5.7, Node.js 20 LTS + Express 4, ssh2 (existing), better-sqlite3 (existing) (013-remote-directory-support)
- SQLite (better-sqlite3) — existing workers and sessions tables (013-remote-directory-support)

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
- 013-remote-directory-support: Added TypeScript 5.7, Node.js 20 LTS + Express 4, ssh2 (existing), better-sqlite3 (existing)
- 012-extension-system: Added TypeScript 5.7, Node.js 20 LTS + React 18, Vite 6, Tailwind CSS 3 (existing); no new dependencies
- 012-session-connect-ux: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, ssh2, better-sqlite3, Tailwind CSS 3
- 012-session-connect-ux: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, better-sqlite3, ssh2, node-pty, xterm.js 5, ws 8, Tailwind CSS 3, Vite 6
- 011-browser-preview: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Tailwind CSS 3, Vite 6, html2canvas-pro@1.5.8, better-sqlite3, ws 8
- 011-browser-preview: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, Vite 6, Tailwind CSS 3, xterm.js 5, better-sqlite3, ws 8, chokidar 4 (existing) + html2canvas, rrweb, rrweb-player, multer (new)
- 012-session-connect-ux: Added TypeScript 5.7, Node.js 20 LTS + React 18, Express 4, better-sqlite3, ssh2, node-pty, xterm.js 5, ws 8, Tailwind CSS 3, Vite 6


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
