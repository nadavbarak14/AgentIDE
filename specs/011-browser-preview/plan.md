# Implementation Plan: Preview Visual Feedback & Media

**Branch**: `011-browser-preview` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-browser-preview/spec.md`

## Summary

Add visual feedback capabilities to the existing preview browser: element selection with commenting (delivered to Claude with screenshots), image upload to sessions, custom preview resolution controllable via agent skill, screenshot capture with annotation tools, and video recording via rrweb. All iframe communication uses a postMessage bridge script injected by the backend proxy — no sandbox attribute changes needed.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, Vite 6, Tailwind CSS 3, xterm.js 5, better-sqlite3, ws 8, chokidar 4 (existing) + html2canvas, rrweb, rrweb-player, multer (new)
**Storage**: SQLite (better-sqlite3) with WAL mode — 3 new tables: `preview_comments`, `uploaded_images`, `video_recordings`
**Testing**: Vitest 2.1.0, @testing-library/react, supertest, jsdom
**Target Platform**: Web application (Linux/macOS server + browser client)
**Project Type**: Web application (frontend + backend workspaces)
**Performance Goals**: Screenshot capture < 2s, comment submission < 1s, image upload < 3s for files < 5MB, bridge script injection adds < 5ms to proxy response time
**Constraints**: Bridge script < 100KB total (html2canvas + rrweb-record + bridge logic loaded on demand), no sandbox attribute changes, recording duration max 5 minutes
**Scale/Scope**: Single-user sessions, up to 50 comments per view, images up to 20MB (auto-compressed above 10MB)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for all new services/hooks, integration tests for new API routes, component tests for new React components, system tests for bridge script injection and board command flow |
| II. UX-First Design | PASS | Spec defines user workflows first (inspect mode, drag-and-drop upload, one-click screenshot). Error states covered (stale comments, unsupported formats, server not running) |
| III. UI Quality & Consistency | PASS | Overlay components follow existing Tailwind design language (gray-800 backgrounds, blue-500 accents). Comment pins use numbered badges consistent with existing UI patterns |
| IV. Simplicity | PASS | Bridge script uses postMessage (browser standard) over complex alternatives. Custom annotation tools (~200 LOC) preferred over heavy libraries. rrweb chosen over server-side video capture |
| V. CI/CD Pipeline | PASS | All new code covered by unit + integration tests. CI pipeline runs existing `npm test && npm run lint` |
| VI. Frontend Plugin Quality | PASS | html2canvas (MIT, actively maintained, TS support), rrweb (MIT, actively maintained, TS support), multer (MIT, Express standard). All evaluated for bundle size |
| VII. Backend Security | PASS | Image upload validates MIME types and file size. Bridge script injection only on HTML responses. No sandbox relaxation. File paths sanitized for path traversal. multer configured with file size limits |
| VIII. Observability | PASS | New API routes log operations. Bridge script errors logged to parent via postMessage. Screenshot/recording creation logged with session context |

**Post-Phase 1 Re-check**: All principles still satisfied. No new violations introduced by data model or API contracts.

## Project Structure

### Documentation (this feature)

```text
specs/011-browser-preview/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions
├── data-model.md        # Phase 1 — schema and entities
├── quickstart.md        # Phase 1 — developer onboarding
├── contracts/
│   └── api.md           # Phase 1 — REST API contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── files.ts            # MODIFY — inject bridge script into proxied HTML
│   │   │   ├── preview.ts          # NEW — preview comments, screenshots, recordings
│   │   │   └── uploads.ts          # NEW — image upload with multer
│   │   ├── inspect-bridge.js       # NEW — bridge script served to iframe
│   │   └── websocket.ts            # existing (no changes)
│   ├── models/
│   │   ├── types.ts                # MODIFY — extend ViewportMode, BoardCommandType, add new interfaces
│   │   ├── repository.ts           # MODIFY — add CRUD for 3 new tables
│   │   └── db.ts                   # MODIFY — create 3 new tables on init
│   ├── services/
│   │   └── preview-service.ts      # NEW — comment delivery, image compression, recording storage
│   └── hub-entry.ts                # MODIFY — register new routes, serve bridge script
└── tests/
    ├── unit/
    │   ├── preview-comments.test.ts    # NEW
    │   ├── uploaded-images.test.ts     # NEW
    │   ├── video-recordings.test.ts    # NEW
    │   └── preview-service.test.ts     # NEW
    └── integration/
        ├── api-preview.test.ts         # NEW
        └── api-uploads.test.ts         # NEW

frontend/
├── src/
│   ├── components/
│   │   ├── LivePreview.tsx             # MODIFY — custom viewport, integrate overlay
│   │   ├── PreviewOverlay.tsx          # NEW — comment pins, inspect mode toggle, toolbar
│   │   ├── AnnotationCanvas.tsx        # NEW — screenshot annotation drawing tools
│   │   ├── ImageUpload.tsx             # NEW — drag-and-drop + file picker
│   │   ├── RecordingPlayer.tsx         # NEW — rrweb-player wrapper
│   │   └── SessionCard.tsx             # MODIFY — handle set_preview_resolution, render ImageUpload
│   ├── hooks/
│   │   ├── usePreviewBridge.ts         # NEW — postMessage communication with bridge
│   │   └── usePanel.ts                 # MODIFY — add custom viewport fields
│   └── services/
│       └── api.ts                      # MODIFY — add API functions for new endpoints
└── tests/
    ├── unit/
    │   └── hooks/
    │       └── usePreviewBridge.test.ts    # NEW
    └── components/
        ├── PreviewOverlay.test.tsx         # NEW
        ├── AnnotationCanvas.test.tsx       # NEW
        ├── ImageUpload.test.tsx            # NEW
        └── RecordingPlayer.test.tsx        # NEW

.claude-skills/skills/
└── set-preview-resolution/             # NEW
    ├── SKILL.md
    └── scripts/
        └── set-preview-resolution.sh
```

**Structure Decision**: Web application structure (existing). All new backend code goes in `backend/src/`, all new frontend code in `frontend/src/`. New skill follows the existing `.claude-skills/skills/` pattern. No new workspace packages needed.

## Complexity Tracking

No constitution violations to justify. All design decisions favor simplicity:
- postMessage over sandbox relaxation
- Custom canvas annotation over heavy library
- rrweb over server-side video capture
- File storage in working directory over centralized blob storage
