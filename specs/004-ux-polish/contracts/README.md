# API Contracts: UX Polish

## New Endpoints

### PUT /api/sessions/:sessionId/comments/:commentId

Update the text of a pending comment.

**Request**:
```json
{
  "commentText": "Updated feedback text"
}
```

**Validation**:
- `commentText` must be a non-empty string
- Comment must exist and belong to the session
- Comment status must be 'pending' (sent comments are immutable)

**Response 200**:
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "filePath": "src/App.tsx",
  "startLine": 10,
  "endLine": 12,
  "codeSnippet": "const x = 1;",
  "commentText": "Updated feedback text",
  "status": "pending",
  "createdAt": "2026-02-18T10:00:00Z",
  "sentAt": null
}
```

**Error 404**: Comment not found or not pending
**Error 400**: Invalid commentText

---

### DELETE /api/sessions/:sessionId/comments/:commentId

Delete a pending comment.

**Validation**:
- Comment must exist and belong to the session
- Comment status must be 'pending'

**Response 200**:
```json
{
  "success": true
}
```

**Error 404**: Comment not found or not pending

## Existing Endpoints (unchanged)

- `GET /api/sessions/:id/comments` — List comments
- `POST /api/sessions/:id/comments` — Create comment
- `POST /api/sessions/:id/comments/deliver` — Deliver all pending
