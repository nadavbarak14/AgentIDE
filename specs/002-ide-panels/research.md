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

## R9: Side-by-Side Diff Rendering Strategy (v2 Clarification)

**Decision**: Rewrite the diff parser to produce paired left/right line arrays, then render as a CSS grid with two columns. Each row is a `{ left: DiffLine | null, right: DiffLine | null }` pair. Context lines populate both sides. Additions fill only the right (left is an empty placeholder). Deletions fill only the left (right is an empty placeholder). This produces a vertically-aligned side-by-side view.

**Rationale**: The user explicitly requested side-by-side two-column diffs (like GitHub PR "Split" view). This is the standard approach used by GitHub, GitLab, VS Code, and other diff tools. It provides the clearest visual comparison for code review. A custom parser is preferred over adding a heavy diff library since we already parse unified diff output from `git diff`.

**Alternatives considered**:
- **diff2html library (side-by-side mode)**: Already in the project's dependencies list but not actively used in the frontend. Could generate side-by-side HTML, but would give less control over the gutter "+" comment interaction. Rejected — custom rendering gives full control over the comment UX.
- **Monaco diff editor**: Monaco has a built-in diff editor mode (`MonacoDiffEditor`). However, it doesn't support custom gutter icons or inline comment boxes, which are essential for the review flow. Rejected.
- **Keep unified with a toggle**: User was explicit about side-by-side. No toggle needed.

**Implementation notes**:
- The `parseDiff()` function must track both old-file and new-file line numbers separately
- Hunk headers contain both ranges: `@@ -oldStart,oldCount +newStart,newCount @@`
- Context lines increment both counters; additions increment only new; deletions increment only old
- Empty placeholder cells should be styled with a subtle background to indicate "no change on this side"

## R10: Files Panel Tree+Editor Coexistence (v2 Clarification)

**Decision**: When the files panel is active, render the file tree and file editor side-by-side within the panel — tree as a narrow sidebar (~200px or 30%), editor taking the remaining space. The tree is always visible for navigation.

**Rationale**: The user explicitly requested "tree + editor side-by-side" like a standard IDE (VS Code, IntelliJ). In v1, clicking a file replaced the tree with the editor, losing navigation context. The side-by-side approach maintains IDE ergonomics.

**Alternatives considered**:
- **Tree replaces editor (v1)**: Current implementation. User found it insufficient — loses navigation. Rejected.
- **Tree as a collapsible sidebar within the editor**: More complex, not what user requested. Rejected.

## R11: Gutter "+" Icon for Comments (v2 Clarification)

**Decision**: Each line in the diff right column has a "+" icon in the gutter, visible on hover. Clicking opens an inline comment box immediately below that line (no intermediate button). Shift-click extends the selection to a range.

**Rationale**: The user explicitly chose the GitHub-style gutter "+" pattern. This is faster (one click) and more discoverable than the v1 approach (click gutter → "Comment" button → click button → input opens).

**Alternatives considered**:
- **Select-then-Comment (v1)**: Two-step process, slower. User wanted direct interaction. Rejected.
- **Right-click context menu**: Not discoverable. Rejected.

## R12: Panel Positioning — Files LEFT, Git/Preview RIGHT (v3 Clarification)

**Decision**: In `SessionCard.tsx`, conditionally render the panel on the left or right side of the terminal based on `activePanel`. When `activePanel === 'files'`, render: `[Files Panel | Drag Handle | Terminal]`. When `activePanel === 'git'` or `'preview'`, render: `[Terminal | Drag Handle | Panel]`.

**Rationale**: User explicitly requested "files should be in the left, like IDE." Traditional IDEs (VS Code, IntelliJ, Sublime) place the file explorer on the left of the editor. Git and preview panels on the right keep the terminal in its natural "primary" position.

**Implementation approach**: Use conditional rendering order in the flex container. The `panelWidthPercent` state already controls the panel width. For left-side panels, the terminal gets `(100 - panelWidthPercent)%` width on the right. For right-side panels (current behavior), the terminal gets `(100 - panelWidthPercent)%` width on the left.

**Alternatives considered**:
- **CSS `flex-direction: row-reverse`**: Would flip the entire layout but also flip the drag handle direction. More confusing. Rejected.
- **Separate left and right panel containers**: Over-engineered — only one panel can be open at a time. Rejected.

## R13: Git Changed Files — Vertical Sidebar (v3 Clarification)

**Decision**: Replace the horizontal file tab bar in `DiffViewer.tsx` with a vertical sidebar on the left side (~180px). The sidebar lists files vertically, each showing: change type badge (M/A/D/R), truncated filename, and +/- counts. The selected file is highlighted with the same blue accent used for active tabs. The diff viewer occupies the remaining space on the right.

**Rationale**: User explicitly said "instead of top bar that is hard to navigate in git changes, i want side bar, like tree file, regular files." A vertical sidebar is more natural for file lists — it mirrors the file tree layout in the Files panel and handles long file lists (many changed files) better than a horizontal scrolling tab bar.

**Layout**:
```
┌──────────────────────────────────────────┐
│ Changes Header (stats, close button)     │
├──────────┬───────────────────────────────┤
│ File     │ Side-by-Side Diff             │
│ Sidebar  │ ┌─────────┬─────────┐        │
│ --------  │ │ Old     │ New     │        │
│ M app.tsx │ │ content │ content │        │
│ A new.ts  │ │         │         │        │
│ D old.ts  │ │         │         │        │
│           │ └─────────┴─────────┘        │
└──────────┴───────────────────────────────┘
```

**Alternatives considered**:
- **Keep horizontal tabs**: User explicitly rejected this as "hard to navigate." Rejected.
- **Accordion/collapsible list**: Unnecessary complexity for a flat file list. Rejected.

## R14: Batch Commenting — Draft + Submit All (v3 Clarification)

**Decision**: Change the comment workflow from immediate submission to a two-phase batch model:

1. **Add Comment**: When the user types a comment and clicks "Add Comment," the comment is stored in local React state (`draftComments` array) with a `draft` status. The comment renders inline on the diff at its anchor line, with a yellow "Draft" badge. The user can continue reviewing and adding more comments on different lines and different files.

2. **Submit All**: A "Submit All" button appears in the DiffViewer header whenever `draftComments.length > 0`. The button shows a count badge. Clicking it iterates through all drafts, calls `commentsApi.create()` for each, and moves them to the `existingComments` array with status `pending` or `sent`.

**State management**: Draft comments live in `DiffViewer`'s React state (not persisted to backend). Each draft has: `{ id, filePath, startLine, endLine, codeSnippet, commentText, status: 'draft' }`. When switching files in the sidebar, drafts for the previous file are preserved in state and re-rendered when returning.

**Rationale**: User explicitly said "multiple comments before submitting." The batch model lets users build up a complete code review before sending feedback, which produces more coherent and actionable feedback for the agent.

**Alternatives considered**:
- **Persist drafts to backend**: Would require a new `draft` status in the DB and a new API endpoint. Over-engineered for local-only state. Rejected.
- **Multi-select comments then submit**: More complex UX with checkboxes. Rejected — "Submit All" is simpler.
- **Auto-save drafts to localStorage**: Would add complexity for a marginal benefit. Drafts are ephemeral within a review session. Rejected.
