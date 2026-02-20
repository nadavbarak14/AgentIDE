# Quickstart: Preview Visual Feedback & Media

**Feature**: 011-browser-preview | **Date**: 2026-02-20

## Prerequisites

- Node.js 20 LTS
- Existing ClaudeQueue development environment (`npm install` completed)
- Familiarity with: React 18, Express 4, TypeScript 5.7, better-sqlite3

## Dependencies

```bash
# Already installed (during initial implementation):
# Backend: multer, html2canvas-pro@1.5.8
# Frontend: html2canvas-pro@1.5.8 (loaded via bridge script CDN)

# No additional dependencies needed for US6 (agent browser control)
# - Accessibility tree extraction: native DOM walk
# - MediaRecorder video recording: browser-native API
# - Element targeting: native DOM queries
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│  ┌─────────────────┐  ┌────────────────────────────┐   │
│  │  LivePreview.tsx │  │  PreviewOverlay.tsx         │   │
│  │  (existing)      │  │  (comment pins, inspect UI) │   │
│  │  ┌─────────────┐│  │  ┌────────────────────┐    │   │
│  │  │   iframe     ││  │  │  Comment pins       │    │   │
│  │  │  (sandboxed) ││  │  │  Screenshot toolbar │    │   │
│  │  │  ┌─────────┐││  │  │  Record indicator   │    │   │
│  │  │  │ Bridge  │││  │  └────────────────────┘    │   │
│  │  │  │ v4      │││  └────────────────────────────┘   │
│  │  │  └────┬────┘││                                    │
│  │  └───────┼─────┘│  ┌────────────────────────────┐   │
│  │          │       │  │  AnnotationCanvas.tsx       │   │
│  └──────────┼───────┘  │  (drawing tools on canvas) │   │
│             │           └────────────────────────────┘   │
│        postMessage                                       │
│             │           ┌────────────────────────────┐   │
│             ▼           │  ImageUpload.tsx            │   │
│     usePreviewBridge()  │  (drag/drop, file picker)  │   │
│     (hook)              └────────────────────────────┘   │
│                                                          │
│                         ┌────────────────────────────┐   │
│                         │  RecordingPlayer.tsx        │   │
│                         │  (HTML5 <video> for WebM)  │   │
│                         └────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                    REST + WebSocket
                          │
┌─────────────────────────────────────────────────────────┐
│  Backend (Express)                                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Proxy routes (existing — modified)               │   │
│  │  - Inject bridge script v4 into HTML responses    │   │
│  │  - Serve /api/inspect-bridge.js?v=4               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Routes                                           │   │
│  │  - /api/sessions/:id/preview-comments             │   │
│  │  - /api/sessions/:id/upload-image                 │   │
│  │  - /api/sessions/:id/upload-screenshot            │   │
│  │  - /api/sessions/:id/upload-recording             │   │
│  │  - /api/sessions/:id/board-command (extended)     │   │
│  │  - /api/sessions/:id/board-command-result (NEW)   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Board command handler (extended)                 │   │
│  │  - view-* commands for agent browser control      │   │
│  │  - requestId + waitForResult response pattern     │   │
│  │  - In-memory Map for pending command results      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                    board-command
                          │
┌─────────────────────────────────────────────────────────┐
│  Agent Skills (.claude-skills/skills/)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /view.screenshot     — capture viewport as PNG   │   │
│  │  /view.record-start   — start WebM recording      │   │
│  │  /view.record-stop    — stop recording, get path  │   │
│  │  /view.set-resolution — set custom viewport size  │   │
│  │  /view.navigate       — go to URL                 │   │
│  │  /view.click          — click element by role+name│   │
│  │  /view.type           — type into element         │   │
│  │  /view.read-page      — get accessibility tree    │   │
│  └──────────────────────────────────────────────────┘   │
│  Each skill: curl → board-command → WebSocket →         │
│              bridge → result → board-command-result →    │
│              curl poll → stdout                          │
└─────────────────────────────────────────────────────────┘
```

## Key Files (Existing / Already Implemented)

### Bridge & Preview Core (implemented)

| File | Status | Purpose |
|------|--------|---------|
| `backend/src/api/inspect-bridge.js` | Done | Bridge v4 — inspect, screenshot (html2canvas-pro), video (MediaRecorder) |
| `frontend/src/hooks/usePreviewBridge.ts` | Done | postMessage communication hook |
| `frontend/src/components/LivePreview.tsx` | Done | Custom viewport, address bar, iframe navigation |
| `frontend/src/components/PreviewOverlay.tsx` | Done | Inspect mode UI, screenshot/record toolbar, comment pins |
| `backend/src/api/routes/preview.ts` | Done | Preview comments CRUD routes |
| `backend/src/api/routes/uploads.ts` | Done | Image upload + screenshot upload routes |
| `backend/src/services/preview-service.ts` | Done | Comment delivery, recording storage |

### To Build (US6: Agent Browser Control)

| File | Purpose |
|------|---------|
| `backend/src/api/inspect-bridge.js` | Extend v4: accessibility tree, click/type by role+name |
| `backend/src/hub-entry.ts` | Add board-command-result endpoint, pending commands map |
| `frontend/src/components/SessionCard.tsx` | Handle view-* commands, relay bridge results back |
| `.claude-skills/skills/view-*/` | 8 skill scripts (shell scripts using curl) |

## Key Patterns

### Bridge postMessage Protocol

```
Parent → Bridge (commands):
  c3:enterInspectMode, c3:exitInspectMode
  c3:captureScreenshot, c3:captureElement
  c3:startRecording, c3:stopRecording
  c3:readPage              (NEW — returns accessibility tree)
  c3:clickElement           (NEW — click by role+name)
  c3:typeElement            (NEW — type into element by role+name)

Bridge → Parent (responses):
  c3:bridge:ready
  c3:bridge:elementSelected
  c3:bridge:screenshotCaptured
  c3:bridge:elementScreenshot
  c3:bridge:recordingStarted, c3:bridge:recordingStopped
  c3:bridge:pageRead        (NEW — accessibility tree text)
  c3:bridge:elementClicked  (NEW — success/error)
  c3:bridge:elementTyped    (NEW — success/error)
```

### Synchronous Board Command Flow (for skills needing results)

```
1. Skill script:    curl POST /board-command {requestId, waitForResult: true}
2. Backend:         stores pending request, returns 202 + requestId
3. Backend:         broadcasts command via WebSocket to frontend
4. Frontend:        handles command, executes via bridge postMessage
5. Bridge:          performs action, sends result back via postMessage
6. Frontend:        receives result, POSTs to /board-command-result {requestId, result}
7. Backend:         resolves pending request
8. Skill script:    curl GET /board-command-result/:requestId → gets result
9. Skill script:    outputs result to stdout
```

## Development Workflow

```bash
# 1. Start the development environment
cd /home/ubuntu/projects/ClaudeQueue
node backend/src/hub-entry.ts

# 2. Build frontend (from frontend dir for Tailwind)
cd frontend && npx vite build

# 3. Run tests
npx vitest

# 4. Test a skill manually
export C3_HUB_PORT=3005
export C3_SESSION_ID=<session-uuid>
.claude-skills/skills/view-screenshot/scripts/view-screenshot.sh

# 5. Test bridge commands in browser console (on the preview page):
# window.parent.postMessage({ type: 'c3:readPage' }, '*')
```

## Database Migration

Already handled — tables created on startup in `backend/src/models/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS preview_comments (...);
CREATE TABLE IF NOT EXISTS uploaded_images (...);
CREATE TABLE IF NOT EXISTS video_recordings (...);
```

No migration script needed (existing pattern).
