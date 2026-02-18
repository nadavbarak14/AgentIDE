# Research: UX Polish (Round 2)

## Decision 1: Comment Edit/Delete API Pattern

**Decision**: Add individual PUT and DELETE endpoints for comments, restricted to pending status only.
**Rationale**: Sent comments should be immutable (they've been delivered to Claude). Only pending comments can be edited or deleted. This matches the existing pattern where `markCommentSent()` is the only status transition.
**Alternatives considered**: (1) Batch edit/delete — unnecessary complexity, users edit one at a time. (2) Soft-delete with status flag — over-engineering for a simple delete.

## Decision 2: Cross-Panel Comment Visibility

**Decision**: No shared state needed. Both FileViewer and DiffViewer already load comments from the same backend endpoint (`commentsApi.list(sessionId)`) on mount and refreshKey changes. Cross-panel visibility works automatically.
**Rationale**: When a user adds a comment in FileViewer and then opens DiffViewer, the DiffViewer's mount effect fetches all comments including the one just created. The 2-second polling refresh also keeps them in sync.
**Alternatives considered**: (1) Shared React context for comments — adds complexity, coupling. (2) Event bus — over-engineering for a feature that works via simple API fetching.

## Decision 3: Inline Comments in DiffViewer — Both Columns

**Decision**: Comments can be placed on both old and new file columns in the side-by-side DiffViewer. The "+" gutter button and text selection commenting work on both sides. A `side` field (`'old'` | `'new'`) is added to the Comment entity to track which column the comment belongs to.
**Rationale**: Users need to comment on old code (e.g., "why was this removed?") and new code (e.g., "this change is wrong"). The `side` field is needed because old line 15 and new line 15 may appear in different rows when there are insertions/deletions. Without `side`, a comment with `startLine: 15` would ambiguously match both rows. The CSS `user-select: none` on the left column (added in round 1) is REMOVED since both columns are now commentable.
**Alternatives considered**: (1) New-file-only restriction — rejected by user. (2) Infer side from codeSnippet content matching — fragile, code could be similar on both sides. (3) Encode side in filePath — hacky, breaks filePath semantics.

## Decision 4: Code Snippet Extraction — Exact Selected Text

**Decision**: When creating a comment via text selection, use `window.getSelection().toString()` to capture the exact selected text as the code snippet. When creating via gutter "+", extract content from the correct column: `pair.left.content` for old-side comments, `pair.right.content` for new-side comments.
**Rationale**: The current implementation always prefers `pair.right?.content`, which sends incorrect text when commenting on the old file column. The `window.getSelection().toString()` approach captures exactly what the user highlighted, including partial-line selections.
**Alternatives considered**: (1) Line-range reconstruction from pairs — doesn't capture partial selections, wrong column preference. (2) Store character offsets — overcomplicates for minimal gain.

## Decision 5: Edit UI — Same Textarea as Add Comment

**Decision**: When editing a comment, display the same full textarea block used for adding comments (multi-line textarea, Save/Cancel buttons), pre-filled with the existing comment text. This replaces the small single-line `<input>` used in round 1.
**Rationale**: Consistent UI for creating and editing. The small inline input was cramped for multi-line comments. The full textarea gives adequate editing space, especially for longer feedback. In DiffViewer, the textarea appears inline below the line (same as add). In FileViewer, it appears inside the Monaco zone widget.
**Alternatives considered**: (1) Small inline input — too cramped. (2) Modal dialog — too heavy, disrupts flow.

## Decision 6: FileViewer Inline Comments — Monaco View Zones

**Decision**: Display inline comments in the FileViewer using Monaco Editor's `changeViewZones` / `addZone` API. Each zone is injected after the commented line with a custom DOM node containing comment text, edit, and delete controls. Zone widgets update when comments change (add/edit/delete).
**Rationale**: Monaco's view zone API (`IViewZone`) is the native mechanism for injecting HTML below editor lines. It handles scrolling, line shifts, and editor layout automatically. This matches the DiffViewer's inline approach. Decorations (yellow glyph margin) are kept as visual indicators alongside zone widgets.
**Implementation**: `editor.changeViewZones(accessor => { accessor.addZone({ afterLineNumber, heightInPx, domNode }) })`. DOM nodes are created with React's `createRoot` or plain DOM manipulation. Zone IDs are tracked for cleanup.
**Alternatives considered**: (1) Decorations only — doesn't show comment text. (2) Panel below editor — disconnects comments from code context. (3) Overlay divs — breaks on scroll/resize.

## Decision 7: Unsaved Close Confirmation Style

**Decision**: Inline confirmation prompt that appears below the tab being closed, with "Discard" and "Cancel" buttons. Not a browser `confirm()`.
**Rationale**: Browser `confirm()` is ugly and inconsistent across browsers. An inline prompt matches the app's dark theme and Tailwind styling. It's also non-blocking and doesn't interrupt the user's flow.
**Alternatives considered**: (1) `window.confirm()` — works but looks foreign. (2) Full modal overlay — too heavy for a simple yes/no.

## Decision 8: Overflow Bar Amber Background

**Decision**: Add `bg-amber-500/20` to the collapsed overflow button when sessions need input.
**Rationale**: Amber background on the full bar width is immediately noticeable. The `/20` opacity keeps it subtle enough not to be jarring but prominent enough to catch attention.
**Alternatives considered**: (1) Solid amber background — too aggressive. (2) Border only — not prominent enough.

## Decision 9: Comment Side Schema

**Decision**: Add a `side` TEXT column to the comments table with default `'new'`. Values: `'old'` (old file column in DiffViewer), `'new'` (new file column in DiffViewer or FileViewer). No migration needed — `ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'` is a backwards-compatible addition.
**Rationale**: Without a `side` field, comments on old line N and new line N (which may be in different diff rows) are ambiguous. The `side` field ensures correct display positioning in the DiffViewer. For FileViewer, all comments are `'new'` since it shows the current file content.
**Alternatives considered**: (1) No side field, match against both columns — ambiguous when old and new line numbers differ. (2) Negative line numbers for old side — hacky, breaks line number semantics.
