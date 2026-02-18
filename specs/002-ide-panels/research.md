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

## R15: Dual-Panel Mode — Three-Column Layout (v4 Clarification)

**Decision**: Support showing both Files and Git panels simultaneously using a three-column layout: `[Files Panel | Terminal | Git Panel]`. The `usePanel` hook must track two independent panel states (`leftPanel` and `rightPanel`) instead of a single `activePanel`. Each toolbar button toggles its respective panel independently. Preview and Git are mutually exclusive on the right side.

**Rationale**: User explicitly requested "i want option to show both files and git." Having file navigation on the left while reviewing diffs on the right (with the terminal in the center) mirrors a full IDE experience. This is the natural evolution — VS Code shows the explorer on the left and source control on the right simultaneously.

**Implementation approach**:
- Change `usePanel` to track `leftPanel: 'none' | 'files'` and `rightPanel: 'none' | 'git' | 'preview'` instead of a single `activePanel`
- `SessionCard.tsx` renders all three columns when both panels are active
- Width management: `leftWidthPercent` and `rightWidthPercent` as separate values, terminal gets the remainder
- Two drag handles: one between left panel and terminal, one between terminal and right panel
- Panel state persistence schema is backward-compatible (add leftPanel/rightPanel fields, keep activePanel for fallback)

**Alternatives considered**:
- **Stacked right panels (files + git both on right)**: Loses the IDE metaphor of files-on-left. Rejected.
- **Tab switching between panels**: User explicitly wants both visible. Rejected.

## R16: Writable File Editor — Save to Disk (v4 Clarification)

**Decision**: Change Monaco editor from `readOnly: true` to `readOnly: false`. Add a save handler (Ctrl+S) that calls a new backend endpoint `PUT /api/sessions/:id/files/content` with the file path and new content. Show a modified indicator (dot on tab) when the editor buffer differs from the last saved/loaded content.

**Rationale**: User explicitly said "files SHOULD be write permissions." A read-only viewer is limiting — users want to make quick edits directly rather than asking the agent for every small change. This is standard IDE behavior.

**Implementation approach**:
- Backend: Add `writeFile()` function in `file-reader.ts` and a `PUT` route in files router
- Frontend API: Add `files.save(sessionId, filePath, content)` method
- FileViewer.tsx: Remove `readOnly: true`, add `onChange` handler to track modifications, `onKeyDown` for Ctrl+S, modified indicator on tab
- Security: Same path sanitization as readFile — `sanitizePath()` prevents traversal

**Alternatives considered**:
- **Send edits as Claude instructions**: Would not give users direct control over file content. Different use case. Rejected.
- **Use file watcher to auto-detect manual edits**: Doesn't work for browser-based editing. Rejected.

## R17: Terminal Clipboard Support (v4 Bug Fix)

**Decision**: Load the `@xterm/addon-clipboard` in `useTerminal.ts` to enable native clipboard operations. Also enable the `rightClickSelectsWord` option and configure `allowProposedApi: true` for clipboard access. When text is selected and Ctrl+C is pressed, copy to clipboard instead of sending SIGINT.

**Rationale**: xterm.js sets `user-select: none` on the terminal element, which prevents native browser text selection. The clipboard addon provides proper copy/paste support by integrating with the browser's Clipboard API. This is a critical usability bug — users cannot copy terminal output.

**Implementation approach**:
- Install `@xterm/addon-clipboard` package
- Load addon in `useTerminal.ts` after terminal creation
- Configure `allowProposedApi: true` in Terminal constructor options
- The addon handles Ctrl+C (copy when selection exists, SIGINT when not) and Ctrl+V (paste) automatically

**Alternatives considered**:
- **Custom event handler for copy**: More code, less reliable than the official addon. Rejected.
- **Enable `user-select: text` via CSS override**: Would conflict with xterm.js canvas rendering. Rejected.

## R18: Multi-Line Comment Selection — Gutter Drag + Text Selection (v5)

**Decision**: Support two methods for selecting lines to comment on in the diff view:
1. **Gutter drag**: Click-and-drag on line numbers in the gutter to select a contiguous range. Track `mousedown` → `mousemove` → `mouseup` on gutter elements to build a range.
2. **Text selection**: When the user selects text across lines in the diff content area, detect the selection via `document.getSelection()`, determine the start/end line numbers from the DOM, and show a floating "Comment" button near the selection.

**Rationale**: User explicitly chose "both" methods. Gutter drag is intuitive for developers accustomed to IDE line selection. Text selection is natural for highlighting specific code snippets. Both methods produce the same result — a line range for the inline comment box.

**Implementation approach**:
- Gutter drag: Add `onMouseDown` handler to gutter elements that starts tracking, `onMouseMove` extends range (highlight lines as drag proceeds), `onMouseUp` opens comment input. Use React state to track `isDragging`, `dragStartLine`, `dragEndLine`.
- Text selection: Add a `mouseup` event listener on the diff content area. On `mouseup`, check `window.getSelection()` for a non-empty selection. Walk the DOM to find the closest line-number ancestors, derive start/end line numbers. Show a floating action button positioned near the selection. Clicking it opens the inline comment box.
- Both methods set `selectedLines` state and open `showCommentInput`, reusing the existing comment flow.

**Alternatives considered**:
- **Only gutter drag**: Misses the natural text-selection pattern. User wanted both.
- **Only text selection**: Less precise for selecting whole lines. User wanted both.
- **Keyboard shortcuts (Ctrl+/ for comment)**: Not discoverable, supplementary at best. Not requested.

## R19: Diff Content Cutoff Fix — Overflow + New File Layout (v5)

**Decision**: Fix two issues causing diff content to appear "cut off":
1. **Horizontal overflow**: Change `overflow-hidden` on `DiffCell` content div (line 450 of DiffViewer.tsx) to `overflow-x-auto`. This allows horizontal scrolling for long lines instead of clipping them.
2. **New file layout**: For files that are 100% additions (change type "A"), use a single-column full-width layout instead of the 50/50 `grid-cols-2` split. The left "Old" column is entirely empty for new files, wasting half the space. Detection: check `file.changeType === 'A'` in the parsed file.

**Rationale**: Users reported content being "kind of cut" when viewing diff. The `overflow-hidden` CSS class clips long lines without any scroll affordance. For new files, the empty left column wastes space and makes content appear cramped.

**Implementation approach**:
- Change the `overflow-hidden` class on the DiffCell content div to `overflow-x-auto`
- In `SideBySideDiff`, check if the file is a new file (all additions). If so, render a single-column layout with just the "New" content at full width, skipping the empty left column.
- Add `overflow-x-auto` to the column headers grid as well for consistency

**Alternatives considered**:
- **Word wrap instead of horizontal scroll**: Would break code formatting and make diffs harder to read. Rejected.
- **Auto-fit columns based on content**: Complex CSS that may break alignment. Rejected.

## R20: Responsive Panel Layout for Smaller Screens (v5)

**Decision**: Enforce minimum widths to prevent panels from becoming unusable on smaller screens:
- Each panel: minimum 200px
- Terminal: minimum 300px
- When the viewport is too narrow for all three columns at minimums (700px), prevent the second panel from opening. The first panel that's already open stays; toggling the second panel shows a brief toast/warning.
- Drag handles enforce minimums during resize — clamp the calculated percentage so neither the panel nor the terminal goes below its minimum pixel width.

**Rationale**: User specifically said "we need to make sure it supports smaller screens." The current implementation uses percentages without pixel minimums, so on a narrow viewport, panels can shrink to unusable sizes.

**Implementation approach**:
- In `SessionCard.tsx` resize handler, calculate pixel widths from container width and enforce minimums. Clamp both panel width and terminal width.
- In the toolbar button handlers, check if opening a second panel would violate minimums. If so, prevent it.
- The `usePanel.ts` hook doesn't need changes — the width clamping is in the view layer.
- Use `containerRef.current.getBoundingClientRect().width` to get actual pixel width for calculations.

**Alternatives considered**:
- **Auto-collapse panels on narrow viewports**: Would be surprising — user clicks a button and nothing happens. Rejected — better to prevent opening with a brief message.
- **Overlay/modal panels on small screens**: Over-engineered for this use case. The dashboard is a desktop tool. Rejected.
- **Media queries to hide panels entirely**: Too aggressive — 1200px laptop screens should still work with one panel. Rejected.

## R21: WebSocket Port Detection → LivePreview Wiring (v5)

**Decision**: Wire the `port_detected` WebSocket event from the terminal connection through to the `SessionCard` component so the `LivePreview` receives the detected port. Currently, the `detectedPort` prop exists in `SessionCard`'s interface but is never provided by `SessionGrid`.

**Rationale**: User reported "preview doesn't really work." Investigation shows the `LivePreview` component is functional but always receives `port=0, localPort=0` because the port detection events aren't propagated from the WebSocket handler to the component tree.

**Implementation approach**:
- In `SessionCard.tsx`, listen for `port_detected` WebSocket messages in the existing `handleWsMessage` callback. Store detected ports in React state: `const [detectedPort, setDetectedPort] = useState<{port: number, localPort: number} | null>(null)`.
- When `msg.type === 'port_detected'`, set `detectedPort` from the message payload.
- Pass the state-managed `detectedPort` to `LivePreview` instead of the prop (which was always null).
- Remove the `detectedPort` prop from `SessionCardProps` since it will now be managed internally.
- This means `SessionGrid` no longer needs to provide it — the port detection is handled per-session by the WebSocket connection that already exists.

**Alternatives considered**:
- **Lift port detection to SessionGrid**: Would require passing WebSocket state up the tree. More complex, no benefit since each SessionCard already has its own WS connection. Rejected.
- **Separate REST endpoint to query ports**: Polling-based, less responsive than WebSocket events. Rejected.
- **Store detected ports in database**: Over-engineered — ports are ephemeral and session-specific. Rejected.

## R22: Diff Scrollbar Fix — Word Wrapping Strategy (v6)

**Decision**: Change diff line content from `whitespace-pre-wrap break-all` to `whitespace-pre-wrap` with `overflow-wrap: anywhere`. Remove any horizontal scrollbar from the diff content container. The v5 approach (`overflow-x-auto`) created per-line scrollbar sliders which was "very weird and bad." The intermediate fix (`break-all`) was too aggressive — it breaks every word at every opportunity, making code unreadable.

**Rationale**: User explicitly said "we never show a long line this way" about the per-line scrollbars. The `break-all` property breaks ANY word at ANY character boundary, which destroys code readability (e.g., `function` becomes `func` + `tion` on the next line). `overflow-wrap: anywhere` only breaks when a word would actually overflow its container, preferring natural break points (spaces, punctuation).

**CSS property comparison**:
- `word-break: break-all` — Breaks at any character in any word. Too aggressive for code.
- `overflow-wrap: break-word` — Only breaks unbreakable words (long strings without spaces). Better but may not handle very long identifiers.
- `overflow-wrap: anywhere` — Like `break-word` but also affects min-content size calculation, ensuring wrapping happens when needed. Best for our diff cells where the container width is determined by the flex layout.

**Implementation approach**:
- DiffCell content div: change `whitespace-pre-wrap break-all` to `whitespace-pre-wrap [overflow-wrap:anywhere]` (Tailwind arbitrary value)
- Main diff content container (line 205): keep `overflow-auto` — this is needed for vertical scrolling. With content wrapping, no horizontal overflow should occur
- Verify: no horizontal scrollbar appears on the diff content container or individual cells

**Alternatives considered**:
- **overflow-x-auto (v5)**: Creates per-line scrollbar sliders. Explicitly rejected by user.
- **break-all (v5.1)**: Breaks words too aggressively. Code becomes unreadable. Rejected.
- **overflow-hidden**: Clips content with no way to see it. Original problem. Rejected.
- **Monospace font-size reduction**: Doesn't solve the root problem, just delays it. Rejected.

## R23: Collapsible SessionQueue Sidebar (v6)

**Decision**: Add a toggle button in the Dashboard top bar that shows/hides the SessionQueue sidebar. Use `localStorage` to persist the state. When hidden, the sidebar's width transitions to 0 with `overflow-hidden` so content doesn't leak. The toggle button uses chevron icons (`>>` to hide, `<<` to show).

**Rationale**: User said "you can hide the new session tab it takes a lot of place we don't need to see it all the time." The SessionQueue sidebar is 320px (`w-80`) and is always visible, consuming significant horizontal space that could be used for the session grid and IDE panels.

**Implementation approach**:
- Dashboard.tsx: Add `const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('c3-sidebar-open') !== 'false')`
- Dashboard.tsx top bar: Add a button before the settings panel with `>>` / `<<` text
- Dashboard.tsx: Wrap SessionQueue in a div with `transition-all duration-200` and toggle `w-80` ↔ `w-0 overflow-hidden`
- On toggle: persist to `localStorage.setItem('c3-sidebar-open', String(!sidebarOpen))`
- SessionQueue.tsx: No changes needed — parent controls rendering

**Alternatives considered**:
- **Auto-collapse in single-view mode**: Would be surprising — user may want sidebar while viewing a session. Rejected.
- **Drawer/overlay sidebar**: More complex animation, occludes content. Rejected.
- **Resizable sidebar**: Over-engineered — users want to hide it entirely, not resize. Rejected.

## R24: Collapsible "More Sessions" Overflow Strip (v6)

**Decision**: Make the "More Sessions" horizontal strip at the bottom of SessionGrid collapsible. Default to collapsed. When collapsed, show a compact bar with the count ("+N more") and a clickable area to expand. When expanded, show the existing horizontal mini-card strip with a collapse control.

**Rationale**: User said "more sessions should be collapsible." The overflow strip takes permanent vertical space showing mini-cards that the user may not need to see most of the time. Collapsing it gives more vertical space to the main session grid.

**Implementation approach**:
- SessionGrid.tsx: Add `const [overflowCollapsed, setOverflowCollapsed] = useState(() => localStorage.getItem('c3-overflow-collapsed') !== 'false')`
- When collapsed: render a single clickable div with "+N more sessions" text and a down-chevron
- When expanded: render the existing horizontal strip with an up-chevron to collapse
- Persist to `localStorage.setItem('c3-overflow-collapsed', String(newState))`
- Smooth transition with `transition-all duration-200`

**Alternatives considered**:
- **Always hidden**: Would lose discoverability of overflow sessions. Rejected.
- **Dropdown menu instead of strip**: Less visual, harder to scan. Rejected.
- **Virtual scrolling in main grid**: Over-engineered — the overflow strip serves a different purpose (secondary sessions). Rejected.

## R25: Background Diff Refresh Without Loading Spinner (v7)

**Decision**: Split the DiffViewer's load effect into two paths: (1) initial load — shows "Loading diff..." spinner when `diff === null`, and (2) background refresh — silently re-fetches diff data when `refreshKey` changes while a diff is already loaded. The background fetch replaces `diff` and `parsedFiles` state in-place without touching `loading`. The `selectedFile`, scroll position, and `existingComments` (pending comments) are separate state variables and are not affected by the data swap.

**Rationale**: The Files panel already updates smoothly via background re-fetch (FileTree and FileViewer receive new `refreshKey` and reload without a spinner). The Git panel should behave identically. The current implementation calls `setLoading(true)` on every refreshKey change, causing a full-screen "Loading diff..." flash that interrupts the user's review.

**Implementation approach**:
- Keep the existing `useEffect` for initial load (when `diff` is null or `sessionId` changes)
- Add a separate `useEffect` for refreshKey changes: only runs when `diff !== null` (i.e., already loaded). Calls `filesApi.diff(sessionId)` silently and updates `diff` + `parsedFiles` without touching `loading`
- Use a ref (`prevRefreshKeyRef`) to detect actual refreshKey changes vs. initial mount
- If the background fetch fails, silently ignore (keep showing existing diff)

**Alternatives considered**:
- **Debounce + loading skeleton**: Still shows visual disruption. Rejected.
- **Optimistic update (diff locally)**: Would require local git logic. Over-engineered. Rejected.
- **Polling instead of event-driven**: Already have file watcher events. Polling adds unnecessary load. Rejected.

## R26: Ephemeral Comments — Clear After Delivery (v7)

**Decision**: Comments are ephemeral feedback. After "Send All" successfully delivers comments to the Claude session via the deliver endpoint, the frontend clears them from `existingComments` state (removing them from the diff view). The backend deletes the delivered comments from the database in the same deliver request — they have served their purpose and don't need to persist.

**Rationale**: User explicitly said "lets remove comments, they don't need to stay just used to give feedback to claude." Comments are a communication mechanism, not a persistent record. Keeping delivered comments clutters the diff view with stale feedback and confuses users about which comments are actionable.

**Implementation approach**:
- Frontend (DiffViewer.tsx `handleSendAll`): After `commentsApi.deliver()` succeeds, filter out delivered comment IDs from `existingComments` state
- Backend (sessions.ts deliver endpoint): After marking comments as 'sent' and injecting into PTY, delete them from the database using `repo.deleteComment(id)` or a batch delete
- Backend (repository.ts): Add `deleteCommentsByIds(ids: string[])` method if not present
- The comment entity in the database becomes truly transient — created on "Add Comment", deleted on "Send All"

**Alternatives considered**:
- **Keep in DB, hide in UI**: Adds complexity with no benefit. If the user wants to see comment history, they can see it in the Claude session's terminal output. Rejected.
- **Auto-expire after N minutes**: Over-engineered for feedback that should be explicit. Rejected.
- **Soft-delete (mark as 'archived')**: No use case for retrieving old comments. Rejected.
