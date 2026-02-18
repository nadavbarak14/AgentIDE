# Quickstart: UX Polish (Round 2)

## Dev Setup

```bash
cd /home/ubuntu/projects/ClaudeQueue
git checkout 004-ux-polish
npm install  # no new dependencies
```

## Build & Run

```bash
# Backend
cd backend && npx tsc && PORT=3005 node dist/hub-entry.js

# Frontend
cd frontend && npx vite build
# Or for dev: npx vite --port 5174
```

## Verification Steps

### US1: Inline Comments with Edit/Delete — Both Columns + FileViewer Zone Widgets

#### DiffViewer (Git panel)

1. Open a session with the Git panel (DiffViewer)
2. Select a file in the file sidebar that has both old and new content
3. Click the "+" gutter on a line in the **new file column** (right side) — comment input appears inline below that line
4. Type feedback and click "Add Comment" — comment stays inline with edit/delete buttons
5. Click the "+" gutter on a line in the **old file column** (left side) — comment input appears inline below that row
6. Type feedback and click "Add Comment" — verify the comment captures the old file text as the code snippet
7. Click "edit" on any inline comment → the same full textarea block (as used for adding) opens pre-filled → change text → click Save
8. Click "×" on another comment → it disappears from the inline display
9. Select text in the **old file column** — floating "Comment" button appears, selection works normally (no user-select restriction)
10. Select text in the **new file column** — floating "Comment" button appears
11. Verify **no summary strip** appears at the bottom of the diff viewer
12. Click "Send All" in DiffViewer header → check that the message sent to Claude includes correct text from each column

#### FileViewer (Code editor)

13. Switch to FileViewer — verify inline comments appear as **Monaco zone widgets** below commented lines (not just yellow glyph decorations)
14. Each zone widget shows: comment text + edit button + delete (×) button
15. Click "edit" on a zone widget comment → full textarea opens for editing → save
16. Click "×" on a zone widget comment → it is removed
17. Select text in the editor → floating "Comment" button appears → add a comment → zone widget appears below the line
18. Click "Send All" in FileViewer tab bar → pending comments are delivered

### US2: Bold Overflow Indicator

1. Set maxVisibleSessions to 1 in settings
2. Create 2+ active sessions
3. Trigger needsInput on an overflow session
4. Collapse the overflow bar
5. Verify the entire bar has an amber/yellow background

### US3: Unsaved File Close Confirmation

1. Open a file in FileViewer
2. Edit the file (yellow dot appears on tab)
3. Click × on the tab
4. Verify a "Unsaved changes" prompt appears with Discard/Cancel
5. Click Cancel → tab stays open, edits intact
6. Click × again, then Discard → tab closes
7. Open a file, don't edit, click × → closes immediately (no prompt)

## Test

```bash
npm test         # All tests
npm run lint     # Lint check
```
