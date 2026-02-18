# Research: IDE Panels

**Feature Branch**: `002-ide-panels` | **Date**: 2026-02-18

## R1: Panel State Persistence Strategy

**Decision**: Store panel state in the existing SQLite `settings`-style approach — a new `panel_states` table keyed by session ID, with a JSON column for the full state object.

**Rationale**: Panel state is per-session, relatively small (list of file paths, scroll positions, active panel type), and must survive browser refresh. SQLite is already the persistence layer and adding a table is simpler than introducing localStorage (which wouldn't survive cross-device access) or a separate store.

**Alternatives considered**:
- **localStorage**: Wouldn't survive cross-device/cross-browser access. Rejected.
- **Column on sessions table**: Too many fields for a JSON blob; a dedicated table keeps sessions table clean.
- **In-memory only**: Panel state lost on refresh. Rejected — spec FR-016 requires persistence.

## R2: Comment Injection Mechanism

**Decision**: Compose a structured text message from the comment (file path, line range, code snippet, user text) and inject it via the existing `POST /api/sessions/:id/input` endpoint, which writes to the PTY stdin. Comments submitted while a session is inactive are stored in a `comments` table and delivered when the session resumes.

**Rationale**: The existing input endpoint already handles sending user text to the PTY. A comment is just a specially formatted user message. Queuing inactive comments requires database persistence.

**Alternatives considered**:
- **Separate Claude API integration**: Would require direct API access, bypassing the terminal. Rejected — the whole point is that Claude Code runs in the terminal.
- **Clipboard-based**: Copy text and require user to paste. Poor UX. Rejected.

**Comment message format**:
```
Please fix the following issue:

File: src/components/App.tsx
Lines: 42-45

```tsx
const count = users.length;
console.log(count);
```

Comment: This variable should be named `userCount` not `count` to avoid ambiguity with the `count` prop.
```

## R3: Diff Line Selection UI Pattern

**Decision**: Use a gutter-based selection model. Each line in the diff view has a clickable gutter. Users click a start line, then shift-click an end line (or click a single line). A floating "Comment" button appears near the selection. Clicking it opens an inline text input anchored below the selected lines.

**Rationale**: This mirrors the GitHub PR review experience, which is well-understood by developers. The gutter click + shift-click is a standard interaction pattern that doesn't conflict with text selection for copying.

**Alternatives considered**:
- **Text selection + context menu**: Conflicts with normal copy-paste behavior. Rejected.
- **Line checkboxes**: Clutters the diff view. Rejected.
- **Right-click menu**: Not discoverable. Rejected.

## R4: Embedded Web Preview — iframe vs. Proxy

**Decision**: Use an iframe pointing directly at the dev server URL. For local workers, the dev server port is directly accessible. For remote workers, existing port forwarding (hub/port-forwarder.ts) already tunnels remote ports to local ports.

**Rationale**: iframe is the simplest approach and works well for local development servers that typically have permissive CORS policies. The existing port forwarding infrastructure handles remote workers.

**Alternatives considered**:
- **Dedicated proxy endpoint**: Would add complexity to the backend and may break WebSocket-based HMR. Rejected.
- **Browser extension**: Requires installation, non-portable. Rejected.
- **Puppeteer/headless browser screenshot stream**: Very high overhead, poor interactivity. Rejected.

**Limitations noted**: Some applications may set `X-Frame-Options: DENY`, preventing iframe embedding. This is acceptable for development servers which typically don't set these headers. A "Open in new tab" fallback link will be provided.

## R5: File Tree Performance for Large Projects

**Decision**: Use lazy loading (load directory contents only when expanded) combined with a search/filter input. The existing backend `files.tree` endpoint already returns a single directory level's contents, which naturally supports lazy loading.

**Rationale**: Projects with thousands of files (e.g., monorepos with node_modules excluded) still have large directory structures. Loading the full tree upfront would be slow and memory-intensive. Lazy loading keeps initial load fast while allowing full exploration.

**Alternatives considered**:
- **Virtual scrolling of flat file list**: Loses directory hierarchy context. Rejected.
- **Full tree preload with virtual DOM**: Memory-intensive for 10k+ entries. Rejected.

## R6: Live File Update Strategy

**Decision**: Leverage the existing file watcher → WebSocket `file_changed` broadcast. When the frontend receives a `file_changed` event:
1. If the Files panel is open and a changed file is in an open tab, re-fetch the file content via `files.content()` and update the viewer with a brief highlight animation on changed regions.
2. If the file tree's current directory contains a changed file, re-fetch the directory listing via `files.tree()`.
3. If the Git panel is open, re-fetch the diff via `files.diff()`.

**Rationale**: The infrastructure exists — watcher, broadcast, and API endpoints are all in place. The frontend just needs to react to the events.

**Alternatives considered**:
- **Server-push full file content on change**: Would flood WebSocket with large file contents. Rejected.
- **Polling**: Higher latency, unnecessary load. Rejected — real-time events already exist.

## R7: Panel Layout — Sidebar vs. Split Pane

**Decision**: Side panel layout — terminal occupies the left portion (resizable, default ~60%), panel occupies the right portion (default ~40%). A drag handle between them allows resize. When no panel is open, the terminal takes full width.

**Rationale**: Side-by-side is the standard IDE layout (VS Code, IntelliJ). It keeps the terminal visible while the user inspects files or diffs, which is critical — the user needs to see both the agent's terminal output and the file/diff context simultaneously.

**Alternatives considered**:
- **Bottom panel (horizontal split)**: Terminal output is tall/narrow, making it harder to read. Rejected.
- **Tabbed full-screen switch**: Loses terminal visibility. Rejected.
- **Floating/overlay panel**: Occludes terminal. Rejected.

## R8: Monaco Editor Configuration for Read-Only Viewer

**Decision**: Use Monaco Editor (`@monaco-editor/react`, already a dependency) for the file viewer in read-only mode. Configure with `readOnly: true`, `minimap: { enabled: false }` for small panels, syntax highlighting based on file extension, and theme matched to the dashboard (dark/light from settings).

**Rationale**: Monaco is already a project dependency, provides excellent syntax highlighting for 50+ languages, and supports read-only mode natively. Using it avoids adding another syntax highlighting library.

**Alternatives considered**:
- **Current `<pre>` element with CSS**: Already in FileViewer.tsx. Lacks proper syntax highlighting quality and line numbers. Needs upgrade.
- **CodeMirror**: Would add another code editor dependency when Monaco already exists. Rejected.
- **highlight.js**: Simpler but lacks line numbers, minimap, and the polished editor feel. Rejected.
