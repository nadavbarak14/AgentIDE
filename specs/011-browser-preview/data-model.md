# Data Model: Preview Visual Feedback & Media

**Feature**: 011-browser-preview | **Date**: 2026-02-20

## New Tables

### preview_comments

Visual comments anchored to elements in the preview browser.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | NOT NULL, FK sessions(id) | Parent session |
| comment_text | TEXT | NOT NULL | User's comment content |
| element_selector | TEXT | | CSS selector of target element |
| element_tag | TEXT | | Tag name (e.g., "div", "button") |
| element_rect_json | TEXT | | JSON: `{"x":0,"y":0,"width":100,"height":50}` — bounding rect relative to viewport |
| screenshot_path | TEXT | | Path to cropped element screenshot file |
| page_url | TEXT | | URL of the page when comment was created |
| pin_x | REAL | NOT NULL | Normalized X position (0.0–1.0) relative to viewport width |
| pin_y | REAL | NOT NULL | Normalized Y position (0.0–1.0) relative to viewport height |
| viewport_width | INTEGER | | Viewport width at time of comment |
| viewport_height | INTEGER | | Viewport height at time of comment |
| status | TEXT | DEFAULT 'pending' | 'pending' / 'sent' / 'stale' |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| sent_at | TEXT | | When delivered to Claude |

**Indexes**:
- `idx_preview_comments_session_status` ON (session_id, status)

---

### uploaded_images

User-uploaded images attached to a Claude session.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | NOT NULL, FK sessions(id) | Parent session |
| original_filename | TEXT | NOT NULL | User's original filename |
| stored_path | TEXT | NOT NULL | Absolute path on disk |
| mime_type | TEXT | NOT NULL | e.g., 'image/png', 'image/jpeg' |
| file_size | INTEGER | NOT NULL | Size in bytes |
| width | INTEGER | | Image width in pixels |
| height | INTEGER | | Image height in pixels |
| compressed | INTEGER | DEFAULT 0 | 1 if auto-compressed |
| status | TEXT | DEFAULT 'pending' | 'pending' / 'sent' |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| sent_at | TEXT | | When delivered to Claude |

**Indexes**:
- `idx_uploaded_images_session` ON (session_id)

---

### video_recordings

Recorded preview browser interactions (WebM video files via MediaRecorder + canvas.captureStream()).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | NOT NULL, FK sessions(id) | Parent session |
| video_path | TEXT | NOT NULL | Path to WebM video file |
| thumbnail_path | TEXT | | Path to first-frame thumbnail PNG |
| duration_ms | INTEGER | | Recording duration in milliseconds |
| file_size | INTEGER | | Video file size in bytes |
| page_url | TEXT | | URL of the page when recording started |
| viewport_width | INTEGER | | Viewport width during recording |
| viewport_height | INTEGER | | Viewport height during recording |
| status | TEXT | DEFAULT 'pending' | 'pending' / 'sent' |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | |

**Indexes**:
- `idx_video_recordings_session` ON (session_id)

---

## Extended Types

### ViewportMode (modified)

```
Before: 'desktop' | 'mobile'
After:  'desktop' | 'mobile' | 'custom'
```

### PanelStateValues (extended)

New fields added to the existing PanelStateValues interface:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| customViewportWidth | number \| null | null | Custom viewport width in pixels |
| customViewportHeight | number \| null | null | Custom viewport height in pixels |

These fields are only meaningful when `previewViewport === 'custom'`.

### BoardCommand (extended)

New command actions for `/view.*` skills:

| Action | Payload | Returns | waitForResult |
|--------|---------|---------|---------------|
| `view-screenshot` | `{}` | `{ path: string }` | yes |
| `view-record-start` | `{}` | — | no |
| `view-record-stop` | `{}` | `{ path: string }` | yes |
| `view-set-resolution` | `{ width: number, height: number }` | — | no |
| `view-navigate` | `{ url: string }` | `{ ok: boolean, error?: string }` | yes |
| `view-click` | `{ role: string, name: string }` | `{ ok: boolean, error?: string }` | yes |
| `view-type` | `{ role: string, name: string, text: string }` | `{ ok: boolean, error?: string }` | yes |
| `view-read-page` | `{}` | `{ tree: string }` | yes |

### BoardCommandRequest (new type)

For skills that need return values (synchronous response pattern):

```typescript
interface BoardCommandRequest {
  action: string;
  payload: Record<string, unknown>;
  requestId?: string;       // UUID for response matching
  waitForResult?: boolean;  // true = caller expects a response
}
```

### BoardCommandResult (new type)

```typescript
interface BoardCommandResult {
  requestId: string;
  result: Record<string, unknown>;
  error?: string;
}
```

### PendingBoardCommand (in-memory, not persisted)

```typescript
interface PendingBoardCommand {
  requestId: string;
  sessionId: string;
  action: string;
  createdAt: number;       // Date.now()
  resolve: (result: BoardCommandResult) => void;
  timeout: NodeJS.Timeout;
}
```

---

## Entity Relationships

```
sessions (existing)
  ├── preview_comments (1:N) — visual comments on preview elements
  ├── uploaded_images (1:N) — user-uploaded images
  └── video_recordings (1:N) — recorded preview interactions (WebM)

panel_states (existing, extended)
  └── customViewportWidth, customViewportHeight — custom resolution settings

board_command_pending (in-memory Map<string, PendingBoardCommand>)
  └── Transient — maps requestId to pending response resolvers
```

---

## State Transitions

### Preview Comment Lifecycle

```
pending → sent       (delivered to Claude via PTY stdin)
pending → stale      (element no longer found after page update)
stale   → pending    (user re-anchors to new element)
sent    → [deleted]  (cleaned up after delivery)
```

### Uploaded Image Lifecycle

```
pending → sent       (delivered to Claude via PTY stdin)
sent    → [deleted]  (cleaned up after delivery)
```

### Video Recording Lifecycle

```
[created] → stored   (WebM file saved to disk)
stored    → sent     (video path sent to Claude)
stored    → [downloaded] (user downloads WebM)
```

---

## File Storage Layout

```
{session.workingDirectory}/
└── .c3-uploads/
    ├── images/
    │   ├── {uuid}.png
    │   ├── {uuid}.jpg
    │   └── ...
    ├── screenshots/
    │   ├── {uuid}.png          (full viewport captures)
    │   ├── {uuid}-element.png  (cropped element captures)
    │   └── {uuid}-annotated.png (with annotations)
    └── recordings/
        ├── {uuid}.webm         (WebM video from MediaRecorder)
        └── {uuid}-thumb.png    (first frame thumbnail)
```

Files stored in the session's working directory are accessible to Claude's sandboxed process and cleaned up with the session.
