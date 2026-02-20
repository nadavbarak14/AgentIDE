# Quickstart: Preview Visual Feedback & Media

**Feature**: 011-browser-preview | **Date**: 2026-02-20

## Prerequisites

- Node.js 20 LTS
- Existing ClaudeQueue development environment (`npm install` completed)
- Familiarity with: React 18, Express 4, TypeScript 5.7, better-sqlite3

## New Dependencies

```bash
# Backend
cd backend && npm install multer html2canvas rrweb @rrweb/types
npm install -D @types/multer

# Frontend
cd frontend && npm install rrweb-player html2canvas rrweb @rrweb/types
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│  ┌─────────────────┐  ┌────────────────────────────┐   │
│  │  LivePreview.tsx │  │  PreviewOverlay.tsx         │   │
│  │  (existing)      │  │  (new — pins, inspect UI)  │   │
│  │  ┌─────────────┐│  │  ┌────────────────────┐    │   │
│  │  │   iframe     ││  │  │  Comment pins       │    │   │
│  │  │  (sandboxed) ││  │  │  Screenshot toolbar │    │   │
│  │  │  ┌─────────┐││  │  │  Record indicator   │    │   │
│  │  │  │ Bridge  │││  │  └────────────────────┘    │   │
│  │  │  │ Script  │││  └────────────────────────────┘   │
│  │  │  └────┬────┘││                                    │
│  │  └───────┼─────┘│  ┌────────────────────────────┐   │
│  │          │       │  │  AnnotationCanvas.tsx       │   │
│  └──────────┼───────┘  │  (new — drawing tools)     │   │
│             │           └────────────────────────────┘   │
│        postMessage                                       │
│             │           ┌────────────────────────────┐   │
│             ▼           │  ImageUpload.tsx            │   │
│     usePreviewBridge()  │  (new — drag/drop, picker) │   │
│     (new hook)          └────────────────────────────┘   │
│                                                          │
│                         ┌────────────────────────────┐   │
│                         │  RecordingPlayer.tsx        │   │
│                         │  (new — rrweb-player)      │   │
│                         └────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                    REST + WebSocket
                          │
┌─────────────────────────────────────────────────────────┐
│  Backend (Express)                                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Proxy routes (existing — modified)               │   │
│  │  - Inject bridge script into HTML responses       │   │
│  │  - Serve /api/inspect-bridge.js static asset      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  New routes                                       │   │
│  │  - /api/sessions/:id/preview-comments             │   │
│  │  - /api/sessions/:id/upload-image                 │   │
│  │  - /api/sessions/:id/screenshots                  │   │
│  │  - /api/sessions/:id/recordings                   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Board command handler (extended)                 │   │
│  │  - set_preview_resolution command                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Key Files to Create

### Backend

| File | Purpose |
|------|---------|
| `backend/src/api/routes/preview.ts` | Preview comments, screenshots, recordings routes |
| `backend/src/api/routes/uploads.ts` | Image upload route with multer |
| `backend/src/api/inspect-bridge.js` | Bridge script served to iframe |
| `backend/src/services/preview-service.ts` | Comment delivery, image compression, recording storage |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/components/PreviewOverlay.tsx` | Comment pins, inspect mode UI, toolbar extensions |
| `frontend/src/components/AnnotationCanvas.tsx` | Screenshot annotation drawing tools |
| `frontend/src/components/ImageUpload.tsx` | Drag-and-drop + file picker for image upload |
| `frontend/src/components/RecordingPlayer.tsx` | rrweb-player wrapper for video playback |
| `frontend/src/hooks/usePreviewBridge.ts` | postMessage communication with bridge script |

### Skills

| File | Purpose |
|------|---------|
| `.claude-skills/skills/set-preview-resolution/SKILL.md` | Skill definition |
| `.claude-skills/skills/set-preview-resolution/scripts/set-preview-resolution.sh` | Skill script |

## Key Files to Modify

### Backend

| File | Change |
|------|--------|
| `backend/src/models/types.ts` | Extend ViewportMode, BoardCommandType; add preview comment/image/recording types |
| `backend/src/models/repository.ts` | Add CRUD methods for new tables |
| `backend/src/api/routes/files.ts` | Inject bridge script into proxied HTML responses |
| `backend/src/hub-entry.ts` | Register new routes, serve bridge script |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/components/LivePreview.tsx` | Add custom viewport rendering, integrate PreviewOverlay |
| `frontend/src/components/SessionCard.tsx` | Handle `set_preview_resolution` board command, render ImageUpload |
| `frontend/src/hooks/usePanel.ts` | Add customViewportWidth/Height to PanelStateValues |
| `frontend/src/services/api.ts` | Add API functions for preview comments, images, screenshots, recordings |

## Development Workflow

```bash
# 1. Start the development environment
npm run dev

# 2. Run backend tests (in a separate terminal)
cd backend && npx vitest --watch

# 3. Run frontend tests (in a separate terminal)
cd frontend && npx vitest --watch

# 4. Test the bridge script manually
# Open preview, check browser console for "c3-inspect-bridge loaded" message

# 5. Test the skill
C3_HUB_PORT=3456 C3_SESSION_ID=test-uuid .claude-skills/skills/set-preview-resolution/scripts/set-preview-resolution.sh 768 1024
```

## Database Migration

Add to `backend/src/models/db.ts` initialization:

```sql
CREATE TABLE IF NOT EXISTS preview_comments (...);
CREATE TABLE IF NOT EXISTS uploaded_images (...);
CREATE TABLE IF NOT EXISTS video_recordings (...);
```

No migration script needed — tables are created on startup (existing pattern).
