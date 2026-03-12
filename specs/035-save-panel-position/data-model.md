# Data Model: Save Panel Position

## Entities

### panel_layout_snapshots (NEW table)

Stores layout dimension snapshots per session per panel combination. Enables restoring exact panel widths/heights when the user returns to a previously configured panel arrangement.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| session_id | TEXT | NOT NULL, FK → sessions(id) ON DELETE CASCADE | The session this snapshot belongs to |
| view_mode | TEXT | NOT NULL, DEFAULT '' | View mode qualifier ('' for grid, 'zoomed' for zoomed) |
| combination_key | TEXT | NOT NULL | Sorted, `+`-joined panel names (e.g., "files", "files+git") |
| left_width_percent | INTEGER | NOT NULL, DEFAULT 25 | Width of the left panel area |
| right_width_percent | INTEGER | NOT NULL, DEFAULT 35 | Width of the right panel area |
| bottom_height_percent | INTEGER | NOT NULL, DEFAULT 40 | Height of the bottom zone if applicable |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last modification timestamp |

**Primary Key**: `(session_id, view_mode, combination_key)`

**Combination Key Format**: Sorted, `+`-joined panel content names that are currently open. Examples:
- Files panel only → `"files"`
- Git panel only → `"git"`
- Files + Git → `"files+git"`
- Files + Preview → `"files+preview"`

### panel_states (EXISTING — no schema changes)

No modifications needed. The existing `terminal_position` column already supports `'center'` and `'bottom'`. The behavior change (terminal stays `'center'` when panels open) is a frontend-only logic change.

## Layout Snapshot Lifecycle

```
Panel toggled (open/close)
    │
    ├── Save current dimensions → panel_layout_snapshots[current_combination]
    │
    ├── Compute new combination key from new set of open panels
    │
    ├── Lookup snapshot for new combination
    │   ├── Found → restore saved widths
    │   └── Not found → use defaults (left: 25%, right: 35%)
    │
    └── Auto-save continues on further resize changes (100ms debounce)
```

## Migration

```sql
CREATE TABLE IF NOT EXISTS panel_layout_snapshots (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  view_mode TEXT NOT NULL DEFAULT '',
  combination_key TEXT NOT NULL,
  left_width_percent INTEGER NOT NULL DEFAULT 25,
  right_width_percent INTEGER NOT NULL DEFAULT 35,
  bottom_height_percent INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, view_mode, combination_key)
);
```
