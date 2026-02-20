# Tasks: Preview Visual Feedback & Media

**Input**: Design documents from `/specs/011-browser-preview/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and extend shared types needed by all stories

- [x] T001 [P] Install new backend dependencies: `cd backend && npm install multer && npm install -D @types/multer`
- [x] T002 [P] Install new frontend dependencies: `cd frontend && npm install html2canvas rrweb rrweb-player @rrweb/types`
- [x] T003 Extend shared types in `backend/src/models/types.ts`: add `'custom'` to `ViewportMode`, add `'set_preview_resolution'` to `BoardCommandType`, add `PreviewComment`, `UploadedImage`, `VideoRecording` interfaces per data-model.md, add `PreviewCommentStatus` type (`'pending' | 'sent' | 'stale'`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create 3 new database tables (`preview_comments`, `uploaded_images`, `video_recordings`) with indexes in `backend/src/models/db.ts` per data-model.md schema
- [x] T005 [P] Create bridge script skeleton in `backend/src/api/inspect-bridge.js`: postMessage listener for commands from parent (`c3:enterInspectMode`, `c3:exitInspectMode`, `c3:captureScreenshot`, `c3:startRecording`, `c3:stopRecording`), response sender helper that posts messages back to parent with `c3:bridge:` prefix, on-load initialization that sends `c3:bridge:ready` to parent
- [x] T006 [P] Create `usePreviewBridge` hook skeleton in `frontend/src/hooks/usePreviewBridge.ts`: manage postMessage listener for bridge responses, provide `sendCommand(command, params)` method, track bridge ready state, return `{ isReady, sendCommand, onMessage }` interface
- [x] T007 Modify proxy routes in `backend/src/api/routes/files.ts` to inject `<script src="/api/inspect-bridge.js"></script>` before `</head>` in HTML responses from all three proxy handlers (localhost proxy, external URL proxy, local file serve). Only inject for `text/html` Content-Type responses. Buffer response body, insert script tag, update Content-Length.
- [x] T008 Register new route files and serve bridge script in `backend/src/hub-entry.ts`: serve `inspect-bridge.js` at `GET /api/inspect-bridge.js` as static file with `application/javascript` Content-Type and cache headers, mount preview routes (created in US1) at `/api/sessions`, mount upload routes (created in US2) at `/api/sessions`
- [x] T009 [P] Create `backend/src/services/preview-service.ts` skeleton: class with constructor accepting repository and session-manager, placeholder methods for comment delivery, image delivery, and recording delivery

**Checkpoint**: Foundation ready — bridge script injected into preview, postMessage protocol established, database tables created

---

## Phase 3: User Story 1 — Element Selection & Visual Commenting (Priority: P1) MVP

**Goal**: Users can enter inspect mode in the preview, click elements to select them, attach comments displayed as numbered pins, and deliver comments to Claude with element context (screenshot + position)

**Independent Test**: Enter inspect mode, click an element, type a comment, verify pin appears and comment is delivered to Claude session with element screenshot and position data

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T010 [P] [US1] Unit test for preview_comments repository CRUD (create, list by session/status, update status, delete, mark sent) in `backend/tests/unit/preview-comments.test.ts` — use real in-memory SQLite
- [x] T011 [P] [US1] Integration test for preview comments API routes (POST create, GET list, POST deliver single, POST deliver batch, PATCH status, DELETE) in `backend/tests/integration/api-preview.test.ts` — use supertest with real Express app and mock PTY spawner
- [x] T012 [P] [US1] Component test for PreviewOverlay (renders pins, opens popover on click, shows comment input on element select, submits comment) in `frontend/tests/components/PreviewOverlay.test.tsx`

### Implementation for User Story 1

- [x] T013 [US1] Add preview_comments repository CRUD methods to `backend/src/models/repository.ts`: `createPreviewComment()`, `getPreviewComments(sessionId, status?)`, `getPreviewComment(id)`, `updatePreviewCommentStatus(id, status)`, `deletePreviewComment(id)`, `markPreviewCommentSent(id)`, `deletePreviewCommentsBySession(sessionId)`. Save `screenshotDataUrl` from request body as a PNG file to `{workingDir}/.c3-uploads/screenshots/{id}-element.png` and store the path
- [x] T014 [US1] Create preview comments routes in `backend/src/api/routes/preview.ts`: `POST /api/sessions/:id/preview-comments` (create comment, decode screenshotDataUrl to file), `GET /api/sessions/:id/preview-comments` (list with optional status filter), `POST /api/sessions/:id/preview-comments/deliver` (deliver all pending as batch), `POST /api/sessions/:id/preview-comments/:commentId/deliver` (deliver single), `PATCH /api/sessions/:id/preview-comments/:commentId` (update status), `DELETE /api/sessions/:id/preview-comments/:commentId` — per contracts/api.md
- [x] T015 [US1] Implement comment delivery logic in `backend/src/services/preview-service.ts`: `deliverPreviewComment(sessionId, commentId)` and `deliverAllPreviewComments(sessionId)` methods. Compose formatted message like `[Visual Feedback] Element: {selector} at ({x},{y}), Screenshot: {path}, Comment: {text}. Please address this feedback.\n` — write to PTY stdin via session-manager, mark comments as sent
- [x] T016 [US1] Add inspect mode commands to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:enterInspectMode` — create full-viewport transparent overlay div, add mousemove handler that highlights elements under cursor with a colored outline box (position:absolute div matching element's getBoundingClientRect), add click handler that posts `c3:bridge:elementSelected` with `{tag, classes, selector, rect: {x,y,width,height}, text}` back to parent. On `c3:exitInspectMode` — remove overlay and handlers. On `c3:captureElement` — dynamically load html2canvas, call `html2canvas(targetElement)`, convert to dataURL, post `c3:bridge:elementScreenshot` with data
- [x] T017 [US1] Extend `usePreviewBridge` hook in `frontend/src/hooks/usePreviewBridge.ts`: add `enterInspectMode()`, `exitInspectMode()`, `captureElement(selector)` commands. Handle `c3:bridge:elementSelected` and `c3:bridge:elementScreenshot` responses. Expose `inspectMode` state boolean, `selectedElement` state, `onElementSelected` callback
- [x] T018 [US1] Create PreviewOverlay component in `frontend/src/components/PreviewOverlay.tsx`: absolute-positioned overlay above the iframe. Includes: inspect mode toggle button (crosshair icon), numbered comment pins at `(pinX * width, pinY * height)` positions, popover on pin click showing comment text, comment input form (textarea + submit button) anchored to selected element position, pin counter badge. Follows existing Tailwind design: `bg-gray-800`, `border-gray-700`, `text-gray-300`, blue-500 accents
- [x] T019 [US1] Add preview comments API functions to `frontend/src/services/api.ts`: `previewComments.create()`, `previewComments.list()`, `previewComments.deliver()`, `previewComments.deliverOne()`, `previewComments.update()`, `previewComments.delete()` — matching contracts/api.md
- [x] T020 [US1] Integrate PreviewOverlay into LivePreview in `frontend/src/components/LivePreview.tsx`: render PreviewOverlay as sibling positioned above iframe (using relative container + absolute overlay), pass `iframeRef` and bridge hook to overlay, load existing comments on mount via API, add/remove pins on comment create/delete

**Checkpoint**: Users can inspect elements, attach comments as pins, and deliver visual feedback to Claude with element screenshots

---

## Phase 4: User Story 2 — Image Upload to Session (Priority: P2)

**Goal**: Users can upload images (drag-and-drop or file picker) to the Claude session. Images display inline and are delivered to Claude via file path reference

**Independent Test**: Drag an image onto the chat area, verify it uploads, displays inline, and can be delivered to Claude with an optional message

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T021 [P] [US2] Unit test for uploaded_images repository CRUD (create, list, get, mark sent, delete) in `backend/tests/unit/uploaded-images.test.ts` — use real in-memory SQLite
- [x] T022 [P] [US2] Integration test for image upload API routes (POST upload with valid/invalid files, GET list, POST deliver, GET file serve) in `backend/tests/integration/api-uploads.test.ts` — use supertest with multipart form data
- [x] T023 [P] [US2] Component test for ImageUpload (renders drop zone, handles drag events, shows file picker, displays uploaded image, shows error for invalid types) in `frontend/tests/components/ImageUpload.test.tsx`

### Implementation for User Story 2

- [x] T024 [US2] Add uploaded_images repository CRUD methods to `backend/src/models/repository.ts`: `createUploadedImage()`, `getUploadedImages(sessionId, status?)`, `getUploadedImage(id)`, `markUploadedImageSent(id)`, `deleteUploadedImage(id)`
- [x] T025 [US2] Create image upload route with multer in `backend/src/api/routes/uploads.ts`: configure multer with file filter (PNG, JPG, GIF, WebP MIME types only), 20MB size limit, destination `{workingDir}/.c3-uploads/images/`. `POST /api/sessions/:id/upload-image` — validate MIME type, save file as `{uuid}.{ext}`, auto-compress images >10MB using sharp or canvas resize (target ~2MB), store metadata in DB. `GET /api/sessions/:id/uploaded-images` — list. `POST /api/sessions/:id/uploaded-images/:imageId/deliver` — deliver with optional message. `GET /api/sessions/:id/uploaded-images/:imageId/file` — serve binary file with correct Content-Type
- [x] T026 [US2] Implement image delivery logic in `backend/src/services/preview-service.ts`: `deliverImage(sessionId, imageId, message?)` method. Compose message like `[Image attached: {filename}] Path: {storedPath}. {userMessage}\n` — write to PTY stdin via session-manager, mark image as sent
- [x] T027 [US2] Create ImageUpload component in `frontend/src/components/ImageUpload.tsx`: drop zone overlay that appears on dragover (covers chat area), file picker button (camera/attachment icon), image preview thumbnail after upload, delivery button with optional message input, progress indicator during upload, error display for invalid file types. Supports PNG, JPG, GIF, WebP
- [x] T028 [US2] Add upload API functions to `frontend/src/services/api.ts`: `uploadedImages.upload(sessionId, file)` using FormData, `uploadedImages.list()`, `uploadedImages.deliver()`, `uploadedImages.getFileUrl()`. Integrate ImageUpload component into `frontend/src/components/SessionCard.tsx` — render near terminal/chat area, handle drag events on the session card

**Checkpoint**: Users can drag-and-drop or pick images to upload, view them inline, and deliver to Claude

---

## Phase 5: User Story 3 — Custom Preview Resolution via Agent Skill (Priority: P3)

**Goal**: Agent (or user) can set the preview to any custom width x height resolution. A new agent skill invokes this via board command. Toolbar gains custom resolution input

**Independent Test**: Invoke the `set-preview-resolution` skill with width=768 height=1024, verify preview renders at those dimensions with correct CSS media query behavior

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T029 [P] [US3] Unit test for custom viewport rendering in LivePreview (custom mode renders iframe at specified dimensions, CSS transform scales to fit panel, switching to desktop/mobile resets custom) in `frontend/tests/unit/components/LivePreview-custom-viewport.test.tsx`
- [x] T030 [P] [US3] Unit test for usePreviewBridge hook in `frontend/tests/unit/hooks/usePreviewBridge.test.ts` — test postMessage send/receive, command dispatching, ready state tracking

### Implementation for User Story 3

- [x] T031 [US3] Extend `usePanel` hook in `frontend/src/hooks/usePanel.ts`: add `customViewportWidth: number | null` and `customViewportHeight: number | null` to `PanelStateValues` interface with defaults `null`. Add `setCustomViewport(width: number, height: number)` method that sets viewport to `'custom'` and stores dimensions. Ensure values persist via existing panel state save/load
- [x] T032 [US3] Update LivePreview custom viewport rendering in `frontend/src/components/LivePreview.tsx`: when `viewportMode === 'custom'` and `customViewportWidth`/`customViewportHeight` are set, render iframe at exact pixel dimensions (`style={{ width: customW, height: customH }}`). Wrap in a container that measures available space and applies `transform: scale(scaleFactor)` with `transform-origin: top left` when iframe dimensions exceed panel. Show resolution label (e.g., "768 x 1024") below the iframe. Add custom width/height input fields to the toolbar (two small number inputs with "x" separator and an "Apply" button), alongside existing desktop/mobile toggle
- [x] T033 [US3] Handle `set_preview_resolution` board command in `frontend/src/components/SessionCard.tsx`: in `handleWsMessage`, add case for `msg.command === 'set_preview_resolution'` — parse `msg.params.width` and `msg.params.height` as integers, validate (positive, ≤4096), call `panel.setCustomViewport(width, height)`, call `ensurePanelOpen('preview')`
- [x] T034 [US3] Create agent skill: `SKILL.md` at `.claude-skills/skills/set-preview-resolution/SKILL.md` with name, description ("Set the preview browser to a custom resolution"). Create script at `.claude-skills/skills/set-preview-resolution/scripts/set-preview-resolution.sh` — accept width and height as arguments, POST to `/api/sessions/${C3_SESSION_ID}/board-command` with `{"command":"set_preview_resolution","params":{"width":"$1","height":"$2"}}` using `C3_HUB_PORT` and `C3_SESSION_ID` env vars. Follow existing skill script pattern from `open-preview.sh`

**Checkpoint**: Agent and users can set any custom resolution; preview scales correctly within panel

---

## Phase 6: User Story 4 — Preview Screenshot Capture (Priority: P4)

**Goal**: Users can capture the current preview viewport as a screenshot, annotate it with drawing tools, and send to Claude or save locally

**Independent Test**: Click screenshot button, verify capture appears, draw an arrow annotation, send to session, verify it arrives

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T035 [P] [US4] Integration test for screenshot API routes (POST save screenshot, POST deliver) in `backend/tests/integration/api-preview.test.ts` (extend existing file)
- [x] T036 [P] [US4] Component test for AnnotationCanvas (renders image, draws arrow/rect/freehand/text, exports annotated image) in `frontend/tests/components/AnnotationCanvas.test.tsx`

### Implementation for User Story 4

- [x] T037 [US4] Add screenshot capture command to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:captureScreenshot` — dynamically load html2canvas if not already loaded, call `html2canvas(document.body, { useCORS: true, allowTaint: true })`, convert canvas to PNG data URL, post `c3:bridge:screenshotCaptured` with `{ dataUrl, width, height }` back to parent
- [x] T038 [US4] Add screenshot save and deliver routes to `backend/src/api/routes/preview.ts`: `POST /api/sessions/:id/screenshots` — decode dataUrl base64 to PNG file at `{workingDir}/.c3-uploads/screenshots/{uuid}.png`, return metadata. `POST /api/sessions/:id/screenshots/:screenshotId/deliver` — compose message with path and optional user message, deliver via PTY stdin
- [x] T039 [US4] Extend usePreviewBridge with `captureScreenshot()` command in `frontend/src/hooks/usePreviewBridge.ts`: send `c3:captureScreenshot` to bridge, handle `c3:bridge:screenshotCaptured` response, return data URL via callback/promise
- [x] T040 [US4] Create AnnotationCanvas component in `frontend/src/components/AnnotationCanvas.tsx`: display captured screenshot on HTML5 canvas. Toolbar with 4 tools: arrow (click start + drag to end), rectangle (click corner + drag), freehand (mousedown + mousemove drawing), text (click to place, type in text input). Color picker (red, blue, green, yellow, white). Undo button. Export button that returns annotated canvas as PNG data URL. Cancel button to discard. Tailwind-styled toolbar matching existing UI
- [x] T041 [US4] Add screenshot button to PreviewOverlay toolbar in `frontend/src/components/PreviewOverlay.tsx`: camera icon button next to inspect toggle. On click: call `captureScreenshot()` from bridge hook, show AnnotationCanvas modal with the captured image. Provide "Send to session" and "Download" buttons. Add screenshot API functions to `frontend/src/services/api.ts`: `screenshots.save()`, `screenshots.deliver()`

**Checkpoint**: Users can capture, annotate, and share screenshots of the preview

---

## Phase 7: User Story 5 — Video Recording & Playback (Priority: P5)

**Goal**: Users can record preview interactions via rrweb, play them back in the IDE, send to Claude, or download

**Independent Test**: Click record, interact with preview for a few seconds, click stop, verify playback works and recording can be sent to session

### Tests for User Story 5 (MANDATORY per Constitution Principle I)

- [x] T042 [P] [US5] Unit test for video_recordings repository CRUD (create, list, get with events, delete) in `backend/tests/unit/video-recordings.test.ts` — use real in-memory SQLite
- [x] T043 [P] [US5] Component test for RecordingPlayer (renders rrweb-player, shows playback controls, handles empty events) in `frontend/tests/components/RecordingPlayer.test.tsx`

### Implementation for User Story 5

- [x] T044 [US5] Add video_recordings repository CRUD methods to `backend/src/models/repository.ts`: `createVideoRecording()`, `getVideoRecordings(sessionId)`, `getVideoRecording(id)` (reads events JSON from disk), `deleteVideoRecording(id)` (deletes DB row and event file)
- [x] T045 [US5] Add recording routes to `backend/src/api/routes/preview.ts`: `POST /api/sessions/:id/recordings` — save rrweb events JSON to `{workingDir}/.c3-uploads/recordings/{uuid}-events.json`, save thumbnail from thumbnailDataUrl, store metadata in DB. `GET /api/sessions/:id/recordings` — list with metadata. `GET /api/sessions/:id/recordings/:id` — return full events for playback. `POST /api/sessions/:id/recordings/:id/deliver` — extract key frame screenshots from events, deliver paths to Claude via PTY stdin
- [x] T046 [US5] Add rrweb-record commands to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:startRecording` — dynamically import rrweb record module, call `record({ emit(event) { parent.postMessage({type: 'c3:bridge:recordingEvent', event}, '*') } })`, send `c3:bridge:recordingStarted`. On `c3:stopRecording` — stop recording, send `c3:bridge:recordingStopped`. Enforce 5-minute max duration (300000ms timer that auto-stops and sends `c3:bridge:recordingAutoStopped`)
- [x] T047 [US5] Extend usePreviewBridge with recording commands in `frontend/src/hooks/usePreviewBridge.ts`: `startRecording()`, `stopRecording()`. Accumulate `c3:bridge:recordingEvent` events in a ref array. Expose `isRecording` state, `recordingDuration` (timer), `recordedEvents` array. Handle `c3:bridge:recordingAutoStopped` to stop accumulating
- [x] T048 [US5] Create RecordingPlayer component in `frontend/src/components/RecordingPlayer.tsx`: wrapper around `rrweb-player` package. Accept events array and viewport dimensions. Show standard playback controls (play, pause, seek slider, time display). "Send to session" button. "Download as WebM" button (use MediaRecorder on rrweb-player's replay canvas to export). Close button
- [x] T049 [US5] Add record button and indicator to PreviewOverlay in `frontend/src/components/PreviewOverlay.tsx`: red circle record button in toolbar. While recording: pulsing red dot + elapsed time counter. Click stop to end recording and open RecordingPlayer modal with recorded events. Add recording API functions to `frontend/src/services/api.ts`: `recordings.save()`, `recordings.list()`, `recordings.get()`, `recordings.deliver()`

**Checkpoint**: Users can record, replay, and share preview interaction recordings

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T050 [P] Verify all tests pass: run `npm test` from root (unit + integration for both workspaces). Ensure coverage thresholds are met per existing vitest configs
- [x] T051 Security audit: verify MIME type validation in upload route rejects non-image files, path traversal prevention in file storage (resolve paths and check they stay within working directory), bridge script injection only modifies HTML Content-Type responses, file size limits enforced by multer config
- [x] T052 [P] Verify structured logging covers all new API routes and error paths in `backend/src/api/routes/preview.ts` and `backend/src/api/routes/uploads.ts` — use existing `createSessionLogger` pattern
- [x] T053 Stale comment detection: when preview refreshes (file_changed event), re-query element selectors via bridge `c3:checkElements` command. For each comment whose selector no longer matches, update status to `'stale'` via API. Implement in `frontend/src/components/PreviewOverlay.tsx` using the bridge hook and file change events
- [x] T054 Code cleanup: remove unused imports, verify TypeScript strict mode compliance (`npx tsc --noEmit` in both workspaces), run `npm run lint` and fix any issues
- [x] T055 Push branch, wait for CI green, create PR targeting main via `gh pr create` with summary of all 5 user stories (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP story
- **US2 (Phase 4)**: Depends on Foundational — independent of US1
- **US3 (Phase 5)**: Depends on Foundational — independent of US1, US2
- **US4 (Phase 6)**: Depends on Foundational + bridge script from US1 (T016 adds html2canvas loading)
- **US5 (Phase 7)**: Depends on Foundational — independent (loads rrweb independently in bridge)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No dependencies on other stories
- **US2 (P2)**: Can start after Phase 2. No dependencies on other stories
- **US3 (P3)**: Can start after Phase 2. No dependencies on other stories
- **US4 (P4)**: Benefits from US1's html2canvas bridge addition (T016), but can implement its own loading. Recommend after US1
- **US5 (P5)**: Can start after Phase 2. No dependencies on other stories

### Within Each User Story

- Tests are written first and should FAIL before implementation
- Repository CRUD before routes
- Routes before service delivery logic
- Bridge script additions before frontend hook extensions
- Backend before frontend integration
- Core implementation before UI polish

### Parallel Opportunities

- T001 and T002 (dependency install) can run in parallel
- All test tasks within a story (marked [P]) can run in parallel
- US1, US2, US3, and US5 can be worked on in parallel after Phase 2
- T005 and T006 (bridge skeleton + hook skeleton) can run in parallel
- T050, T052, T054 (verification tasks) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests in parallel:
Task: "T010 — Unit test for preview_comments repo in backend/tests/unit/preview-comments.test.ts"
Task: "T011 — Integration test for preview comments API in backend/tests/integration/api-preview.test.ts"
Task: "T012 — Component test for PreviewOverlay in frontend/tests/components/PreviewOverlay.test.tsx"

# Then sequential implementation:
T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T009)
3. Complete Phase 3: User Story 1 (T010–T020)
4. **STOP and VALIDATE**: Test inspect mode + commenting end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Element Commenting) → Test independently → MVP!
3. Add US2 (Image Upload) → Test independently → Enhanced feedback
4. Add US3 (Custom Resolution) → Test independently → Agent capability
5. Add US4 (Screenshots) → Test independently → Visual capture
6. Add US5 (Video Recording) → Test independently → Full suite
7. Polish → CI green → PR → Merge

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (Element Commenting) — highest value
- Developer B: US2 (Image Upload) — independent, high value
- Developer C: US3 (Custom Resolution) + US5 (Video Recording) — lighter stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Bridge script (`inspect-bridge.js`) grows incrementally across US1, US4, US5
- Repository (`repository.ts`) gains methods across US1, US2, US5
- Preview routes (`preview.ts`) gains endpoints across US1, US4, US5
- PreviewOverlay (`PreviewOverlay.tsx`) gains UI elements across US1, US4, US5
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
