# Data Model: IDE Panels

**Feature Branch**: `002-ide-panels` | **Date**: 2026-02-18

## Entity Relationship

```
sessions (existing)
  │
  ├── 1:1 ── panel_states
  │           Per-session IDE panel configuration
  │
  └── 1:N ── comments
              Code review comments on diffs
```

## New Tables

### `panel_states`

Stores the IDE panel configuration for each session. One row per session. Created lazily when the user first interacts with panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| session_id | TEXT | PRIMARY KEY, FK → sessions(id) ON DELETE CASCADE | Session this state belongs to |
| active_panel | TEXT | DEFAULT 'none' | Currently open panel: 'none', 'files', 'git', 'preview' |
| file_tabs | TEXT | DEFAULT '[]' | JSON array of open file paths, ordered |
| active_tab_index | INTEGER | DEFAULT 0 | Index of the selected tab in file_tabs |
| tab_scroll_positions | TEXT | DEFAULT '{}' | JSON object: {filePath: {line: number, column: number}} |
| git_scroll_position | INTEGER | DEFAULT 0 | Scroll offset in the git changed files list |
| preview_url | TEXT | DEFAULT '' | Last used preview URL |
| panel_width_percent | INTEGER | DEFAULT 40 | Width of the side panel as percentage (20-80) |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp, updated on every save |

**Indexes**:
- Primary key on `session_id` (implicit)

**State transitions**:
- Created: First time user opens any panel for a session
- Updated: Every panel interaction (open/close panel, switch tabs, scroll, resize)
- Deleted: Cascades when session is deleted

### `comments`

Stores code review comments that users add on git diffs. Comments may be pending delivery (session inactive) or sent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID, unique comment identifier |
| session_id | TEXT | NOT NULL, FK → sessions(id) ON DELETE CASCADE | Session this comment targets |
| file_path | TEXT | NOT NULL | Relative file path within the working directory |
| start_line | INTEGER | NOT NULL | First line of the selected range (1-based) |
| end_line | INTEGER | NOT NULL | Last line of the selected range (1-based) |
| code_snippet | TEXT | NOT NULL | The selected code text from the diff |
| comment_text | TEXT | NOT NULL | User's feedback/instruction |
| status | TEXT | NOT NULL, DEFAULT 'pending' | 'pending' or 'sent' |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| sent_at | TEXT | | ISO 8601 timestamp when injected into session |

**Indexes**:
- `idx_comments_session` on `(session_id)`
- `idx_comments_status` on `(status)`

**State transitions**:
```
pending ──→ sent
   │
   └──→ (deleted with session via CASCADE)
```

- Created: User submits a comment in the diff view
- pending → sent: Comment text is successfully injected into the session's terminal input
- Deleted: Cascades when session is deleted

## Existing Table Modifications

### `settings` (add columns)

No modifications needed. The `grid_layout` column already tracks '1x1' which corresponds to 1-view mode. The IDE toolbar visibility is derived from `grid_layout === '1x1'`.

### `sessions` (no changes)

The session table remains unchanged. Panel state is stored in the separate `panel_states` table to keep the sessions table clean.

## Validation Rules

### panel_states
- `active_panel` must be one of: 'none', 'files', 'git', 'preview'
- `file_tabs` must be valid JSON array of strings
- `tab_scroll_positions` must be valid JSON object
- `active_tab_index` must be >= 0 and < length of file_tabs (or 0 if file_tabs is empty)
- `panel_width_percent` must be between 20 and 80

### comments
- `file_path` must not contain `..` or null bytes (path traversal prevention)
- `start_line` must be >= 1
- `end_line` must be >= start_line
- `comment_text` must not be empty
- `status` must be one of: 'pending', 'sent'

## Query Patterns

### Panel State Operations
```sql
-- Get panel state for a session
SELECT * FROM panel_states WHERE session_id = ?;

-- Upsert panel state (SQLite INSERT OR REPLACE)
INSERT OR REPLACE INTO panel_states (session_id, active_panel, file_tabs, active_tab_index, tab_scroll_positions, git_scroll_position, preview_url, panel_width_percent, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));

-- Delete panel state (handled by CASCADE, but also manual cleanup)
DELETE FROM panel_states WHERE session_id = ?;
```

### Comment Operations
```sql
-- Get all comments for a session (ordered by creation)
SELECT * FROM comments WHERE session_id = ? ORDER BY created_at ASC;

-- Get pending comments for a session (for delivery on resume)
SELECT * FROM comments WHERE session_id = ? AND status = 'pending' ORDER BY created_at ASC;

-- Create a comment
INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'));

-- Mark comment as sent
UPDATE comments SET status = 'sent', sent_at = datetime('now') WHERE id = ?;
```
