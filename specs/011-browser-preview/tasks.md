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

**Goal**: Users can record preview interactions as WebM video, play them back in the IDE, send to Claude, or download

**Independent Test**: Click record, interact with preview for a few seconds, click stop, verify playback works and recording can be sent to session

### Tests for User Story 5 (MANDATORY per Constitution Principle I)

- [x] T042 [P] [US5] Unit test for video_recordings repository CRUD (create, list, get with events, delete) in `backend/tests/unit/video-recordings.test.ts` — use real in-memory SQLite
- [x] T043 [P] [US5] Component test for RecordingPlayer (renders video player, shows playback controls, handles empty video) in `frontend/tests/components/RecordingPlayer.test.tsx`

### Implementation for User Story 5

- [x] T044 [US5] Add video_recordings repository CRUD methods to `backend/src/models/repository.ts`: `createVideoRecording()`, `getVideoRecordings(sessionId)`, `getVideoRecording(id)` (reads events JSON from disk), `deleteVideoRecording(id)` (deletes DB row and event file)
- [x] T045 [US5] Add recording routes to `backend/src/api/routes/preview.ts`: `POST /api/sessions/:id/recordings` — save WebM video to `{workingDir}/.c3-uploads/recordings/{uuid}.webm`, save thumbnail from thumbnailDataUrl, store metadata in DB. `GET /api/sessions/:id/recordings` — list with metadata. `GET /api/sessions/:id/recordings/:id` — return recording metadata. `POST /api/sessions/:id/recordings/:id/deliver` — deliver video path to Claude via PTY stdin
- [x] T046 [US5] Add MediaRecorder video recording commands to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:startRecording` — use html2canvas-pro to capture frames at 3 FPS, draw to offscreen canvas, use `canvas.captureStream()` + `MediaRecorder` to record as WebM. Send `c3:bridge:recordingStarted`. On `c3:stopRecording` — stop MediaRecorder, collect blob, convert to data URL, send `c3:bridge:recordingStopped` with `{ videoDataUrl }`. Enforce 5-minute max (auto-stop timer)
- [x] T047 [US5] Extend usePreviewBridge with recording commands in `frontend/src/hooks/usePreviewBridge.ts`: `startRecording()`, `stopRecording()`. Expose `isRecording` state, `recordingDuration` (timer), `videoDataUrl` (WebM data URL). Handle `c3:bridge:recordingAutoStopped`
- [x] T048 [US5] Create RecordingPlayer component in `frontend/src/components/RecordingPlayer.tsx`: HTML5 `<video>` player for WebM playback. Accept `videoDataUrl` prop. Show standard playback controls (play, pause, seek). "Send to session" button. "Download" button. Close button
- [x] T049 [US5] Add record button and indicator to PreviewOverlay in `frontend/src/components/PreviewOverlay.tsx`: red circle record button in toolbar. While recording: pulsing red dot + elapsed time counter. Click stop to end recording and open RecordingPlayer modal with video. Add recording API functions to `frontend/src/services/api.ts`: `recordings.save()`, `recordings.list()`, `recordings.get()`, `recordings.deliver()`

**Checkpoint**: Users can record, replay, and share preview interaction recordings

---

## Phase 8: User Story 6 — Agent Browser Control (Priority: P6)

**Goal**: The Claude agent can programmatically control the preview browser — navigating to pages, clicking elements by accessible role+name, typing text, reading page content as accessibility tree, and capturing screenshots/recordings — all via `/view.*` skills dispatched through the board command protocol with a new synchronous response pattern

**Independent Test**: Have the agent navigate to a page, read the accessibility tree, click a button by role+name, verify the action succeeds, and read the updated page state

### Foundational for User Story 6

These tasks provide the synchronous board command response infrastructure that ALL `/view.*` skills depend on.

- [x] T056 [US6] Add synchronous board command response endpoint to `backend/src/hub-entry.ts`: create an in-memory `Map<string, { resolve, timeout }>` for pending commands. Extend `POST /api/sessions/:id/board-command` to accept optional `requestId` and `waitForResult` fields — when `waitForResult` is true, store the pending request and return `202 Accepted` with `{ ok: true, requestId }`. Add `POST /api/sessions/:id/board-command-result` route — frontend calls this with `{ requestId, result }` to resolve a pending command. Add `GET /api/sessions/:id/board-command-result/:requestId` route — skill scripts poll this (long-poll up to 30s, return result when available, 202 if still pending, 408 on timeout). Clean up stale pending commands after 60s. Per research.md R-002 and contracts/api.md
- [x] T057 [US6] Extend `frontend/src/components/SessionCard.tsx` to handle `view-*` board commands: in the `board_command` WebSocket handler, add cases for all `view-*` actions. For fire-and-forget commands (`view-set-resolution`, `view-record-start`): execute immediately via bridge hook. For result-returning commands (`view-screenshot`, `view-record-stop`, `view-navigate`, `view-click`, `view-type`, `view-read-page`): execute via bridge, wait for bridge response, then POST result to `/api/sessions/:id/board-command-result` with the `requestId` from the command. Must pass `requestId` through the bridge call chain. Handle the case where preview is not open by returning an error result

### Tests for User Story 6 (MANDATORY per Constitution Principle I)

- [x] T058 [P] [US6] Unit test for board command result endpoint in `backend/tests/unit/board-command-result.test.ts`: test pending command creation, result delivery resolving pending requests, polling returning results, polling timeout (202 then 408), stale command cleanup, invalid requestId handling. Use real Express app with supertest
- [x] T059 [P] [US6] Unit test for accessibility tree extraction in `backend/tests/unit/accessibility-tree.test.ts`: create a JSDOM document with various HTML elements (headings, links, buttons, inputs, navigation, lists), call the tree-building function, verify output matches expected indented text format with correct roles, names, values, and states. Test hidden element filtering, aria-label priority, label-for association, input type mapping
- [x] T060 [P] [US6] Unit test for element targeting by role+name in `backend/tests/unit/element-targeting.test.ts`: create JSDOM documents with multiple elements, test finding elements by role+name (case-insensitive, trimmed), test first-match behavior for duplicates, test error reporting when no match found (includes available elements of that role), test click event dispatch, test type action (focus + value set + input/change events)
- [x] T061 [P] [US6] Integration test for `/view.*` skill round-trip in `backend/tests/integration/view-skills.test.ts`: test the full flow — POST board-command with requestId → verify 202 response → POST board-command-result → verify GET board-command-result returns the result. Test multiple concurrent pending commands. Test timeout behavior. Use supertest with real Express app

### Bridge Script Extensions for User Story 6

- [x] T062 [US6] Add accessibility tree extraction to bridge script in `backend/src/api/inspect-bridge.js`: implement `buildAccessibilityTree(root)` function per research.md R-001. Walk DOM depth-first, skip hidden elements (`display:none`, `visibility:hidden`, `aria-hidden="true"`). Map HTML elements to ARIA roles using W3C implicit role mapping: `<button>`→`button`, `<a>`→`link`, `<input type="text">`→`textbox`, `<input type="checkbox">`→`checkbox`, `<h1>`→`heading level=1`, `<nav>`→`navigation`, `<main>`→`main`, `<ul>`→`list`, `<li>`→`listitem`, `<select>`→`combobox`, `<textarea>`→`textbox`, `<img>`→`img`. Extract accessible name from (in priority order): `aria-label`, `aria-labelledby` referent text, `<label for="">` text, visible text content (trimmed), `title` attribute, `placeholder`. Include value for inputs, checked/selected/expanded states. Return indented text tree (2-space indent per depth level). On `c3:readPage` command → call `buildAccessibilityTree(document.body)` → post `c3:bridge:pageRead` with `{ tree: string }`. Skip elements with `data-c3-bridge` or `data-c3-overlay` attributes
- [x] T063 [US6] Add click-by-role+name to bridge script in `backend/src/api/inspect-bridge.js`: implement `findElementByRoleAndName(role, name)` function per research.md R-003. Walk DOM, match elements by implicit ARIA role (same mapping as T062) and accessible name (case-insensitive, trimmed). If match found: scroll into view, dispatch `mousedown`, `mouseup`, `click` events (for proper event simulation), post `c3:bridge:elementClicked` with `{ ok: true }`. If no match: collect all elements of the requested role with their names, post `c3:bridge:elementClicked` with `{ ok: false, error: "Element not found", available: [...] }`. On `c3:clickElement` command with `{ role, name }` → execute. If element is `<a>` with `href`, click triggers natural navigation
- [x] T064 [US6] Add type-by-role+name to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:typeElement` command with `{ role, name, text }` → find element using same `findElementByRoleAndName()` from T063. If found and element is an input/textarea/contenteditable: focus the element, set `element.value = text` (or `textContent` for contenteditable), dispatch `input` event and `change` event (for form frameworks like React that listen on these), post `c3:bridge:elementTyped` with `{ ok: true }`. If found but not an input type: post error `{ ok: false, error: "Element is not an input. Role: {actualRole}" }`. If not found: same error as click with available elements
- [x] T065 [US6] Add navigate command to bridge script in `backend/src/api/inspect-bridge.js`: on `c3:navigateTo` command with `{ url }` → set `window.location.href = url`. The bridge will reload with the new page. The parent frame detects navigation via the iframe `onload` event. Post `c3:bridge:navigated` with `{ ok: true }` immediately before navigation. Note: since navigation reloads the bridge, the frontend must handle the case where the bridge reloads and re-sends `c3:bridge:ready` — use a one-time `load` listener on the iframe to detect navigation completion and resolve the result

### usePreviewBridge Hook Extensions for User Story 6

- [x] T066 [US6] Extend `usePreviewBridge` hook in `frontend/src/hooks/usePreviewBridge.ts`: add `readPage()`, `clickElement(role, name)`, `typeElement(role, name, text)`, `navigateTo(url)` command methods. Handle new bridge responses: `c3:bridge:pageRead` (returns tree string), `c3:bridge:elementClicked` (returns ok/error), `c3:bridge:elementTyped` (returns ok/error), `c3:bridge:navigated` (returns ok). Add a callback-based request/response pattern: each command sends a unique `msgId`, responses include the `msgId`, hook resolves the matching Promise. This enables the SessionCard to await bridge results for the board-command-result relay

### `/view.*` Skill Scripts for User Story 6

Each skill script: create `SKILL.md` with name and description, create shell script that uses `curl` to POST board command and (for result skills) poll for result. Use `$C3_SESSION_ID` and `$C3_HUB_PORT` env vars. Generate a UUID for `requestId` using `uuidgen` or `cat /proc/sys/kernel/random/uuid`.

- [x] T067 [P] [US6] Create `/view.screenshot` skill in `.claude-skills/skills/view-screenshot/`: `SKILL.md` (description: "Capture a screenshot of the current preview browser viewport. Returns the file path of the saved PNG image."). Script at `scripts/view-screenshot.sh` — POST board command `{ "command": "view-screenshot", "params": {}, "requestId": "$REQ_ID", "waitForResult": true }`, poll for result, output the `path` field from result JSON to stdout
- [x] T068 [P] [US6] Create `/view.record-start` skill in `.claude-skills/skills/view-record-start/`: `SKILL.md` (description: "Start recording the preview browser as a WebM video. Use /view.record-stop to stop recording and get the file path."). Script at `scripts/view-record-start.sh` — POST board command `{ "command": "view-record-start", "params": {} }` (fire-and-forget, no waitForResult), output "Recording started" to stdout
- [x] T069 [P] [US6] Create `/view.record-stop` skill in `.claude-skills/skills/view-record-stop/`: `SKILL.md` (description: "Stop the current preview browser recording and save as WebM video. Returns the file path of the saved video."). Script at `scripts/view-record-stop.sh` — POST board command with waitForResult, poll for result, output the `path` field to stdout
- [x] T070 [P] [US6] Create `/view.set-resolution` skill in `.claude-skills/skills/view-set-resolution/`: `SKILL.md` (description: "Set the preview browser viewport to a custom resolution. Arguments: width height (in pixels, e.g., 768 1024)."). Script at `scripts/view-set-resolution.sh` — accept `$1` (width) and `$2` (height) as arguments, POST board command `{ "command": "view-set-resolution", "params": { "width": $1, "height": $2 } }` (fire-and-forget), output "Resolution set to ${1}x${2}" to stdout. Note: this replaces the old `set-preview-resolution` naming but uses the same `set_preview_resolution` board command action that the frontend already handles
- [x] T071 [P] [US6] Create `/view.navigate` skill in `.claude-skills/skills/view-navigate/`: `SKILL.md` (description: "Navigate the preview browser to a URL. Arguments: url (e.g., http://localhost:3000/login)."). Script at `scripts/view-navigate.sh` — accept `$1` (url) as argument, POST board command with waitForResult `{ "command": "view-navigate", "params": { "url": "$1" } }`, poll for result, output "Navigated to $1" on success or error message on failure
- [x] T072 [P] [US6] Create `/view.click` skill in `.claude-skills/skills/view-click/`: `SKILL.md` (description: "Click an element in the preview browser by its accessible role and name. Arguments: role name (e.g., button \"Sign In\"). Use /view.read-page first to see available elements."). Script at `scripts/view-click.sh` — accept `$1` (role) and `$2` (name) as arguments, POST board command with waitForResult `{ "command": "view-click", "params": { "role": "$1", "name": "$2" } }`, poll for result, output success or error with available elements list
- [x] T073 [P] [US6] Create `/view.type` skill in `.claude-skills/skills/view-type/`: `SKILL.md` (description: "Type text into an element in the preview browser. Arguments: role name text (e.g., textbox \"Email\" \"user@test.com\"). Use /view.read-page first to see available input elements."). Script at `scripts/view-type.sh` — accept `$1` (role), `$2` (name), `$3` (text) as arguments, POST board command with waitForResult `{ "command": "view-type", "params": { "role": "$1", "name": "$2", "text": "$3" } }`, poll for result, output success or error
- [x] T074 [P] [US6] Create `/view.read-page` skill in `.claude-skills/skills/view-read-page/`: `SKILL.md` (description: "Read the current preview browser page content as an accessibility tree showing interactive elements with their roles, names, labels, and states. Returns a compact text representation."). Script at `scripts/view-read-page.sh` — POST board command with waitForResult `{ "command": "view-read-page", "params": {} }`, poll for result, output the `tree` field from result JSON to stdout

**Checkpoint**: Agent can autonomously navigate, interact with, and observe the preview browser via `/view.*` skills

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T050 [P] Verify all tests pass: run `npm test` from root (unit + integration for both workspaces). Ensure coverage thresholds are met per existing vitest configs
- [x] T051 Security audit: verify MIME type validation in upload route rejects non-image files, path traversal prevention in file storage (resolve paths and check they stay within working directory), bridge script injection only modifies HTML Content-Type responses, file size limits enforced by multer config
- [x] T052 [P] Verify structured logging covers all new API routes and error paths in `backend/src/api/routes/preview.ts` and `backend/src/api/routes/uploads.ts` — use existing `createSessionLogger` pattern
- [x] T053 Stale comment detection: when preview refreshes (file_changed event), re-query element selectors via bridge `c3:checkElements` command. For each comment whose selector no longer matches, update status to `'stale'` via API. Implement in `frontend/src/components/PreviewOverlay.tsx` using the bridge hook and file change events
- [x] T054 Code cleanup: remove unused imports, verify TypeScript strict mode compliance (`npx tsc --noEmit` in both workspaces), run `npm run lint` and fix any issues
- [x] T075 Update `video_recordings` table schema in `backend/src/models/db.ts`: rename `events_path` column to `video_path`, rename `event_count` column to `file_size` (INTEGER for bytes), add `status` column (TEXT DEFAULT 'pending'). Use `ALTER TABLE` statements with fallback for existing databases. Update corresponding repository methods in `backend/src/models/repository.ts` to use new column names
- [x] T076 Rename `set-preview-resolution` skill to `view-set-resolution` namespace: update the skill directory name, SKILL.md, and script name. Keep backwards compatibility by having the frontend handle both `set_preview_resolution` and `view-set-resolution` board command names in `frontend/src/components/SessionCard.tsx`
- [x] T077 Update bridge auto-stop recording timer from 60 seconds to 5 minutes (300000ms) in `backend/src/api/inspect-bridge.js` — spec says 5-minute maximum per clip (FR-022)
- [x] T078 Add structured logging for board command result operations in `backend/src/hub-entry.ts`: log pending command creation (requestId, action, sessionId), result delivery, polling attempts, timeouts, and cleanup of stale commands
- [x] T079 Run full test suite: `npm test` from root. Ensure all new US6 tests plus existing US1-US5 tests pass. Fix any regressions
- [x] T080 Push branch, wait for CI green, create PR targeting main via `gh pr create` with summary of all 6 user stories (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately ✅ COMPLETE
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) — BLOCKS all user stories ✅ COMPLETE
- **US1 (Phase 3)**: Depends on Foundational — MVP story ✅ COMPLETE
- **US2 (Phase 4)**: Depends on Foundational — independent of US1 ✅ COMPLETE
- **US3 (Phase 5)**: Depends on Foundational — independent of US1, US2 ✅ COMPLETE
- **US4 (Phase 6)**: Depends on Foundational + bridge script from US1 (T016 adds html2canvas loading) ✅ COMPLETE
- **US5 (Phase 7)**: Depends on Foundational ✅ COMPLETE
- **US6 (Phase 8)**: Depends on T056 (board-command-result endpoint) + T057 (SessionCard handler). Bridge script extensions (T062-T065) depend on existing bridge v4. Skills (T067-T074) depend on T056 for polling
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story 6 Internal Dependencies

```
T056 (board-command-result endpoint) ─────────────────────┐
T057 (SessionCard view-* handler) ────────────────────────┤
                                                          │
T062 (accessibility tree) ──┐                             │
T063 (click by role+name) ──┤ can run in parallel         │
T064 (type by role+name) ───┤ (different functions in     │
T065 (navigate command) ────┘  same file, independent)    │
                                                          │
T066 (usePreviewBridge extensions) ──── depends on T062-T065
                                                          │
T067-T074 (skill scripts) ───── can run in [P]arallel ────┘
                                 depend on T056 (polling endpoint)
```

### Within User Story 6

1. T056 + T057 FIRST (foundational infrastructure for all skills)
2. T058-T061 tests in PARALLEL (different files)
3. T062-T065 bridge extensions in PARALLEL (independent functions)
4. T066 hook extensions (depends on T062-T065 for message types)
5. T067-T074 skill scripts in PARALLEL (independent directories, depend on T056)
6. T075-T080 polish tasks

### Parallel Opportunities (Phase 8)

```bash
# Tests — all in parallel:
T058: board-command-result test
T059: accessibility tree test
T060: element targeting test
T061: view-skills integration test

# Bridge extensions — all in parallel:
T062: accessibility tree
T063: click by role+name
T064: type by role+name
T065: navigate command

# All 8 skill scripts — in parallel:
T067: view-screenshot
T068: view-record-start
T069: view-record-stop
T070: view-set-resolution
T071: view-navigate
T072: view-click
T073: view-type
T074: view-read-page
```

---

## Parallel Example: User Story 6

```bash
# Step 1: Foundational (sequential — T057 depends on T056)
Task: "T056 — Board command result endpoint in backend/src/hub-entry.ts"
Task: "T057 — SessionCard view-* command handler in frontend/src/components/SessionCard.tsx"

# Step 2: Launch all tests in parallel
Task: "T058 — Board command result endpoint test"
Task: "T059 — Accessibility tree extraction test"
Task: "T060 — Element targeting test"
Task: "T061 — View skills integration test"

# Step 3: Launch all bridge extensions in parallel
Task: "T062 — Accessibility tree in bridge"
Task: "T063 — Click by role+name in bridge"
Task: "T064 — Type by role+name in bridge"
Task: "T065 — Navigate command in bridge"

# Step 4: Hook extensions (depends on bridge extensions)
Task: "T066 — usePreviewBridge hook extensions"

# Step 5: Launch all skill scripts in parallel
Task: "T067-T074 — All 8 /view.* skill scripts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-5 — DONE)

1. ~~Complete Phase 1: Setup (T001–T003)~~ ✅
2. ~~Complete Phase 2: Foundational (T004–T009)~~ ✅
3. ~~Complete Phase 3-7: User Stories 1-5 (T010–T049)~~ ✅
4. ~~Polish (T050-T054)~~ ✅

### US6 Incremental Delivery

5. Complete T056-T057: Board command result infrastructure → Foundation for all skills
6. Complete T062-T065: Bridge script extensions → Agent can interact with pages
7. Complete T066: Hook extensions → Frontend can relay bridge results
8. Complete T067-T074: Skill scripts → Agent has full `/view.*` skill set
9. Complete T075-T080: Polish + PR → Ship

### Risk Mitigation

- T056 (board command result endpoint) is the single-point dependency — if it fails, all skills are blocked. Implement and test thoroughly first.
- Bridge navigation (T065) is trickiest because `window.location.href` reloads the bridge — test the iframe `onload` reconnection pattern carefully.
- Accessibility tree (T062) is the largest new code — test with diverse HTML fixtures.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T001-T055 are complete from US1-US5 implementation
- T056-T080 are new tasks for US6 (Agent Browser Control) + polish
- Bridge script (`inspect-bridge.js`) gains 4 new command handlers in US6
- Each `/view.*` skill is a self-contained directory with SKILL.md + shell script
- Board command result pattern is the key new infrastructure (in-memory Map, not DB)
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
