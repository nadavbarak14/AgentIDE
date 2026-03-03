# API Contract: Remove Completed Sessions

## No New Endpoints

This feature requires no new API endpoints. All changes are internal:

1. **Backend auto-deletion**: Sessions are deleted server-side after completion/failure events fire.
2. **Startup cleanup**: Non-active sessions are deleted when the server starts.
3. **Existing `DELETE /api/sessions/:id`**: Unchanged, still available for manual deletion if needed.

## WebSocket Behavior Change

### Existing `session_status` event (behavior change)

The server still broadcasts the same event:

```json
{
  "type": "session_status",
  "sessionId": "uuid",
  "status": "completed",
  "claudeSessionId": "string|null",
  "pid": null
}
```

**Frontend behavior change**: Instead of updating the session's status in local state, the frontend now **removes the session entirely** from state when receiving status `completed` or `failed`. The session no longer exists on the server after this event.

Same applies to `status: "failed"`.
