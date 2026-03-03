# Data Model: Remove Completed Sessions

## No Schema Changes

This feature requires **no database schema changes**. Sessions are deleted using the existing `deleteSession()` logic.

## Behavioral Change

Sessions now have an ephemeral lifecycle — they exist only while active:

```
create → active → [process exits] → deleted
```

The intermediate `completed` and `failed` states still occur momentarily (for event emission) but the session is deleted immediately after.

## Existing Cascade Targets (unchanged)

**Automatic via FK ON DELETE CASCADE**:
- `artifacts` (session_id)
- `comments` (session_id)
- `preview_comments` (session_id)
- `uploaded_images` (session_id)
- `video_recordings` (session_id)

**Manual cascade in repository code**:
- `panel_states` (session_id, session_id + ":zoomed")

**File cleanup**:
- Scrollback files at `./scrollback/shell-{sessionId}.scrollback`

## New Repository Method

```
deleteNonActiveSessions(): number  // returns count of deleted sessions
```

Runs `DELETE FROM sessions WHERE status != 'active'` + manual panel_states cleanup. Used for startup cleanup only.
