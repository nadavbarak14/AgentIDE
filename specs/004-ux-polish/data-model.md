# Data Model: UX Polish

## Schema Change

One new column added to the `comments` table.

```sql
ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new';
```

## Entities

### Comment (modified — new `side` column)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | FK → sessions ON DELETE CASCADE | |
| file_path | TEXT | NOT NULL | Relative file path |
| start_line | INTEGER | NOT NULL | Line number from the side the comment was placed on |
| end_line | INTEGER | NOT NULL | Line number from the side the comment was placed on |
| code_snippet | TEXT | NOT NULL | Exact text from the column/selection the user commented on |
| comment_text | TEXT | NOT NULL | User's feedback — editable via PUT endpoint |
| status | TEXT | DEFAULT 'pending' | 'pending' or 'sent' — edit/delete only when 'pending' |
| **side** | **TEXT** | **DEFAULT 'new'** | **NEW — 'old' (left column) or 'new' (right column / FileViewer)** |
| created_at | TEXT | DEFAULT datetime('now') | ISO datetime |
| sent_at | TEXT | NULL | Set when delivered to Claude |

### Operations on Comment

- **Create**: Includes `side` field from frontend (`'old'` or `'new'`)
- **Update**: `UPDATE comments SET comment_text = ? WHERE id = ? AND status = 'pending'`
- **Delete**: `DELETE FROM comments WHERE id = ? AND status = 'pending'`
- **Display**: Match `side='old'` against left column line numbers, `side='new'` against right column line numbers

### PanelState (unchanged)

No changes needed. Comments are session-scoped, not panel-scoped.
