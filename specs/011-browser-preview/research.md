# Research: Preview Visual Feedback & Media

**Branch**: `011-browser-preview` | **Date**: 2026-02-20 | **Spec**: `specs/011-browser-preview/spec.md`

## R-001: Accessibility Tree Extraction (for `/view.read-page`)

**Decision**: Walk the DOM in the bridge script to build a compact accessibility tree using implicit ARIA role mapping.

**Rationale**: The bridge script already runs inside the preview iframe with full DOM access. Browser accessibility APIs (`element.role`, `element.computedRole`) are not universally available, but we can derive roles from HTML semantics (e.g., `<button>` → `button`, `<input type="text">` → `textbox`, `<a>` → `link`). This avoids any external dependency and keeps the tree compact for token efficiency.

**Approach**:
- Walk DOM tree depth-first, skip hidden elements (`display:none`, `visibility:hidden`, `aria-hidden="true"`)
- Map HTML elements to ARIA roles using W3C implicit role mapping table
- Extract: role, accessible name (from `aria-label`, `aria-labelledby`, `<label>`, text content, `title`, `placeholder`), value (for inputs), checked/selected/expanded states
- Return as indented text tree (not JSON) for maximum token efficiency
- Example output:
  ```
  heading "Welcome" level=1
    link "Sign In" href="/login"
  navigation
    list
      listitem
        link "Home" href="/"
      listitem
        link "Dashboard" href="/dashboard"
  main
    textbox "Email" value="" required
    textbox "Password" value="" required
    button "Log In"
  ```

**Alternatives considered**:
- Chrome DevTools Protocol accessibility API — requires CDP connection, not available in sandboxed iframe
- Full HTML dump — too many tokens, not actionable
- Visible text only — loses structure and interactive element identification

---

## R-002: Synchronous Board Command Response Pattern

**Decision**: Extend existing board command protocol with `requestId` and `waitForResult` to support skills that need return values (screenshot path, accessibility tree, error messages).

**Rationale**: Current board commands are fire-and-forget. Agent skills like `/view.screenshot` and `/view.read-page` need to return data. Adding a `requestId` to the command lets the frontend match responses, and a new `POST /api/sessions/:id/board-command-result` endpoint lets the frontend push results back. The skill shell script polls or long-polls for the result.

**Approach**:
1. Skill script sends `POST /api/sessions/:id/board-command` with `{ action, payload, requestId, waitForResult: true }`
2. Backend stores pending request in memory map, returns `202 Accepted` with `{ requestId }`
3. Frontend receives command via WebSocket, executes via bridge, gets result
4. Frontend sends `POST /api/sessions/:id/board-command-result` with `{ requestId, result }`
5. Backend resolves pending request, returns result to the original long-poll or stores for retrieval
6. Skill script calls `GET /api/sessions/:id/board-command-result/:requestId` (polls with timeout)

**Alternatives considered**:
- WebSocket bidirectional — skill scripts are shell scripts that use `curl`, not WebSocket clients
- Temporary file polling — works but slower and more complex than HTTP polling
- Stdout piping — would require changing the entire skill execution model

---

## R-003: Element Targeting by Accessible Role + Name

**Decision**: `/view.click` and `/view.type` use `role` + `name` parameters to find elements, matching the accessibility tree output.

**Rationale**: This creates a natural read→act loop: agent reads page with `/view.read-page` (gets accessibility tree), then acts on elements using the same role+name identifiers it just read. CSS selectors are fragile and require implementation knowledge; accessible names are stable and user-facing.

**Approach**:
- Bridge script receives `{ role: "button", name: "Sign In" }` command
- Walks DOM to find elements matching that role (using same mapping as R-001)
- Matches accessible name (case-insensitive, trimmed whitespace)
- If multiple matches: uses first match (document order)
- If no match: returns error with list of available elements of that role
- Click: dispatches `click` event; Type: focuses element, sets value, dispatches `input` and `change` events

**Alternatives considered**:
- CSS selector targeting — fragile, requires implementation knowledge
- XPath — verbose, not natural language
- Coordinate-based clicking — imprecise, viewport-dependent

---

## R-004: Screenshot Capture with html2canvas-pro

**Decision**: Use html2canvas-pro@1.5.8 for all screenshot operations (already integrated in bridge v4).

**Rationale**: Already implemented and tested. html2canvas-pro is a maintained fork of html2canvas with modern CSS support (oklab, oklch). It renders DOM to canvas purely in-browser, avoiding the SVG foreignObject artifacts that dom-to-image-more produced.

**Key implementation details** (already in place):
- `onclone` callback replaces `<input>` elements with styled `<div>` elements for proper text rendering
- `scale: window.devicePixelRatio` for retina-quality captures
- Bridge elements (`[data-c3-overlay]`, `[data-c3-highlight]`) hidden in cloned DOM
- Screenshot saved to `<workDir>/.c3-uploads/screenshots/<uuid>.png` via `POST /api/sessions/:id/upload-screenshot`

**Alternatives rejected** (during development):
- `dom-to-image-more`: Used SVG foreignObject, caused black border artifacts
- Original `html2canvas`: Missing modern CSS support (oklab, oklch)

---

## R-005: Video Recording with MediaRecorder + canvas.captureStream()

**Decision**: Use MediaRecorder API with canvas.captureStream() at 3 FPS (already integrated in bridge v4).

**Rationale**: Already implemented. Uses html2canvas-pro to capture frames at 3 FPS interval, draws them to an offscreen canvas, and records the canvas stream as WebM video. This approach works within the iframe sandbox without requiring screen capture permissions.

**Key implementation details** (already in place):
- 3 FPS capture rate (balance between quality and performance)
- WebM format with VP8/VP9 codec (MediaRecorder default)
- 5-minute maximum enforced by auto-stop timer
- Video data sent as data URL to parent via postMessage
- Red recording indicator overlay displayed during capture

**Alternatives rejected** (during development):
- `rrweb` DOM recording: Produced a JSON event stream, not real video; playback required rrweb-player component; complex to export as video
- `getDisplayMedia()`: Requires user screen share permission, captures more than just the preview

---

## R-006: Skill Script Pattern for `/view.*` Skills

**Decision**: Each `/view.*` skill follows the existing shell script pattern in `.claude-skills/skills/<name>/scripts/`, using `curl` to send board commands and poll for results.

**Rationale**: Existing skills (`open-file`, `open-preview`, `show-panel`, `show-diff`) already use this pattern. The `/view.*` skills add the `requestId` + polling pattern from R-002 for skills that need return values.

**Approach**:
- Skill scripts are bash scripts in `.claude-skills/skills/view-<name>/scripts/view-<name>.sh`
- Use `C3_SESSION_ID` and `C3_HUB_PORT` environment variables (injected by pty-spawner)
- Send command: `curl -s -X POST http://localhost:$C3_HUB_PORT/api/sessions/$C3_SESSION_ID/board-command -H 'Content-Type: application/json' -d '{"action":"view-<name>","payload":{...},"requestId":"$REQ_ID","waitForResult":true}'`
- Poll for result: `curl -s http://localhost:$C3_HUB_PORT/api/sessions/$C3_SESSION_ID/board-command-result/$REQ_ID`
- Parse JSON result and output relevant data to stdout

**Skills requiring results** (use polling): `/view.screenshot`, `/view.record-stop`, `/view.read-page`, `/view.click`, `/view.type`, `/view.navigate`
**Skills without results** (fire-and-forget): `/view.record-start`, `/view.set-resolution`

---

## R-007: Bridge Script Injection (already implemented)

**Decision**: Inject bridge script tag into HTML responses at the proxy level, served as a static asset with cache busting.

**Rationale**: Already implemented in `backend/src/api/routes/files.ts`. The backend proxy routes intercept HTML responses and inject `<script src="/api/inspect-bridge.js?v=4" data-c3-bridge></script>` before `</head>`. The `data-c3-bridge` attribute prevents the URL rewriter MutationObserver from modifying the tag.

---

## R-008: Annotation Tools — Lightweight Custom Canvas

**Decision**: Build lightweight custom canvas annotation tools (arrow, rectangle, freehand, text).

**Rationale**: The four required tools are straightforward canvas operations. A library would add unnecessary dependency weight for what amounts to ~200 lines of canvas drawing code. After screenshot capture, display the image on an HTML5 `<canvas>` with an overlay toolbar. Each tool modifies canvas state via mouse event handlers. Export the annotated canvas as a PNG data URL.

**Alternatives considered**:
- Fabric.js (~300KB): Overkill for 4 simple tools
- Konva.js (~150KB): Similar concern
- tldraw: Interactive whiteboard library, way too heavy

---

## Dependencies

| Package | Purpose | Status | License |
|---------|---------|--------|---------|
| `html2canvas-pro@1.5.8` | DOM-to-canvas screenshot & video frames | Already installed | MIT |
| `multer` | Multipart form data for image upload | Already installed | MIT |

All other features (video recording, accessibility tree, annotation tools) are built with browser-native APIs — no additional dependencies needed.
