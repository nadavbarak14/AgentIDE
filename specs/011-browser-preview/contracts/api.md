# API Contracts: Preview Visual Feedback & Media

**Feature**: 011-browser-preview | **Date**: 2026-02-20

---

## Preview Comments

### POST /api/sessions/:id/preview-comments

Create a visual comment anchored to a preview element.

**Request**:
```json
{
  "commentText": "This button should be blue, not gray",
  "elementSelector": "button.submit-btn",
  "elementTag": "button",
  "elementRect": { "x": 120, "y": 340, "width": 200, "height": 48 },
  "screenshotDataUrl": "data:image/png;base64,...",
  "pageUrl": "http://localhost:3000/checkout",
  "pinX": 0.35,
  "pinY": 0.55,
  "viewportWidth": 1280,
  "viewportHeight": 720
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "commentText": "This button should be blue, not gray",
  "elementSelector": "button.submit-btn",
  "elementTag": "button",
  "elementRectJson": "{\"x\":120,\"y\":340,\"width\":200,\"height\":48}",
  "screenshotPath": "/work/.c3-uploads/screenshots/uuid-element.png",
  "pageUrl": "http://localhost:3000/checkout",
  "pinX": 0.35,
  "pinY": 0.55,
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "status": "pending",
  "createdAt": "2026-02-20T10:00:00.000Z",
  "sentAt": null
}
```

---

### GET /api/sessions/:id/preview-comments

List preview comments for a session.

**Query params**:
- `status` (optional): `pending` | `sent` | `stale`

**Response** (200):
```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "commentText": "...",
    "elementSelector": "...",
    "pinX": 0.35,
    "pinY": 0.55,
    "status": "pending",
    "createdAt": "..."
  }
]
```

---

### POST /api/sessions/:id/preview-comments/deliver

Deliver all pending preview comments to the Claude session as a single batch message via PTY stdin.

**Response** (200):
```json
{
  "delivered": 3,
  "message": "[Visual Feedback — 3 comments] (1) Element: button.submit-btn at (120,340), Comment: This button should be blue... (2) ... Please address all visual feedback."
}
```

---

### POST /api/sessions/:id/preview-comments/:commentId/deliver

Deliver a single preview comment immediately.

**Response** (200):
```json
{
  "delivered": true,
  "commentId": "uuid"
}
```

---

### PATCH /api/sessions/:id/preview-comments/:commentId

Update a comment (e.g., mark as stale).

**Request**:
```json
{
  "status": "stale"
}
```

**Response** (200):
```json
{
  "id": "uuid",
  "status": "stale"
}
```

---

### DELETE /api/sessions/:id/preview-comments/:commentId

Delete a preview comment.

**Response** (204): No content

---

## Image Upload

### POST /api/sessions/:id/upload-image

Upload an image to the session. Multipart form data.

**Request**: `Content-Type: multipart/form-data`
- Field `image`: File (PNG, JPG, GIF, WebP; max 20MB)

**Response** (201):
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "originalFilename": "mockup.png",
  "storedPath": "/work/.c3-uploads/images/uuid.png",
  "mimeType": "image/png",
  "fileSize": 245000,
  "width": 1920,
  "height": 1080,
  "compressed": false,
  "status": "pending",
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

**Error** (400):
```json
{
  "error": "Unsupported file type. Supported: PNG, JPG, GIF, WebP"
}
```

**Error** (413):
```json
{
  "error": "File too large. Maximum size: 20MB"
}
```

---

### GET /api/sessions/:id/uploaded-images

List uploaded images for a session.

**Query params**:
- `status` (optional): `pending` | `sent`

**Response** (200):
```json
[
  {
    "id": "uuid",
    "originalFilename": "mockup.png",
    "mimeType": "image/png",
    "fileSize": 245000,
    "width": 1920,
    "height": 1080,
    "status": "pending",
    "createdAt": "..."
  }
]
```

---

### POST /api/sessions/:id/uploaded-images/:imageId/deliver

Deliver an uploaded image to the Claude session via PTY stdin. Sends a message referencing the image file path so Claude can read it.

**Request** (optional):
```json
{
  "message": "Please implement this design mockup"
}
```

**Response** (200):
```json
{
  "delivered": true,
  "imageId": "uuid",
  "deliveredPath": "/work/.c3-uploads/images/uuid.png"
}
```

---

### GET /api/sessions/:id/uploaded-images/:imageId/file

Serve the uploaded image file (for inline display in frontend).

**Response** (200): Binary image data with correct `Content-Type` header.

---

## Screenshots

### POST /api/sessions/:id/screenshots

Save a screenshot capture (viewport or annotated).

**Request**:
```json
{
  "dataUrl": "data:image/png;base64,...",
  "pageUrl": "http://localhost:3000/checkout",
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "annotated": false
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "storedPath": "/work/.c3-uploads/screenshots/uuid.png",
  "pageUrl": "http://localhost:3000/checkout",
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

---

### POST /api/sessions/:id/screenshots/:screenshotId/deliver

Send a screenshot to the Claude session.

**Request** (optional):
```json
{
  "message": "Here's the current state of the checkout page"
}
```

**Response** (200):
```json
{
  "delivered": true,
  "screenshotId": "uuid"
}
```

---

## Video Recordings

### POST /api/sessions/:id/recordings

Save a completed recording (rrweb events).

**Request**:
```json
{
  "events": [...],
  "durationMs": 30000,
  "pageUrl": "http://localhost:3000",
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "thumbnailDataUrl": "data:image/png;base64,..."
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "eventsPath": "/work/.c3-uploads/recordings/uuid-events.json",
  "thumbnailPath": "/work/.c3-uploads/recordings/uuid-thumb.png",
  "durationMs": 30000,
  "eventCount": 1250,
  "pageUrl": "http://localhost:3000",
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

---

### GET /api/sessions/:id/recordings

List recordings for a session.

**Response** (200):
```json
[
  {
    "id": "uuid",
    "durationMs": 30000,
    "eventCount": 1250,
    "pageUrl": "...",
    "thumbnailPath": "...",
    "createdAt": "..."
  }
]
```

---

### GET /api/sessions/:id/recordings/:recordingId

Get recording detail including events for playback.

**Response** (200):
```json
{
  "id": "uuid",
  "events": [...],
  "durationMs": 30000,
  "viewportWidth": 1280,
  "viewportHeight": 720
}
```

---

### POST /api/sessions/:id/recordings/:recordingId/deliver

Send key frames from a recording to the Claude session.

**Response** (200):
```json
{
  "delivered": true,
  "keyframeCount": 5,
  "recordingId": "uuid"
}
```

---

## Board Commands (Extended)

### POST /api/sessions/:id/board-command

Existing endpoint. New command type added:

**Request** (new command):
```json
{
  "command": "set_preview_resolution",
  "params": {
    "width": "768",
    "height": "1024"
  }
}
```

**Response** (200):
```json
{ "ok": true }
```

Frontend handles this by updating panel state to `previewViewport: 'custom'` with `customViewportWidth: 768`, `customViewportHeight: 1024`.

---

## Static Assets

### GET /api/inspect-bridge.js

Serves the preview inspect bridge script. Cached by browser.

**Response** (200): JavaScript file with `Content-Type: application/javascript`.

This script is injected into proxied HTML responses and provides:
- Inspect mode (hover highlight, element selection)
- Screenshot capture (html2canvas)
- Video recording (rrweb-record)
- postMessage communication with the parent frame
