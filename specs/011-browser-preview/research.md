# Research: Preview Visual Feedback & Media

**Feature**: 011-browser-preview | **Date**: 2026-02-20

## R1: Iframe Inspect Mode — How to Access DOM Inside Sandboxed Iframe

**Decision**: Use a postMessage bridge script injected by the backend proxy into HTML responses.

**Rationale**: The iframe uses `sandbox="allow-scripts allow-forms allow-popups"` without `allow-same-origin`, making the iframe's origin opaque. The parent frame cannot access `iframe.contentDocument`. However, since ALL preview content passes through our backend proxy routes (`/proxy/:port/*`, `/proxy-url/:encoded`, `/serve/*`), we can inject a small bridge script (`c3-inspect-bridge.js`) into HTML responses before they reach the iframe. This bridge:

1. Listens for `postMessage` commands from the parent (`enterInspectMode`, `exitInspectMode`, `selectElement`)
2. On inspect mode: adds mouseover/click handlers, renders highlight overlays using a full-viewport `<div>` overlay
3. On element click: extracts element info (tag, classes, bounding rect, computed CSS selector) and sends back via `postMessage`
4. Captures cropped element screenshots via `html2canvas` (loaded inside the iframe) and returns as data URL

**Alternatives considered**:
- **Add `allow-same-origin` to sandbox**: Simplifies DOM access but creates a critical security risk — `allow-same-origin` + `allow-scripts` lets iframe content remove its own sandbox entirely. Rejected for security.
- **Server-side DOM inspection (Puppeteer)**: Heavy dependency, adds latency, complex infrastructure. Rejected for simplicity.

---

## R2: Screenshot Capture — Browser-Side vs Server-Side

**Decision**: Use `html2canvas` inside the iframe via the injected bridge script.

**Rationale**: Since the bridge script runs inside the iframe, it has full DOM access to the previewed page. `html2canvas` (v1.4, ~40KB gzipped) renders the DOM to a canvas element, which can be converted to a data URL and sent to the parent via `postMessage`. This approach:

- Requires no same-origin access from the parent
- Captures CSS styling accurately (fonts, gradients, transforms)
- Works with any proxied content (localhost, project://, external)
- Element-level capture: pass a specific DOM element to `html2canvas(element)` for cropped screenshots

**Alternatives considered**:
- **`canvas.drawImage(iframe)`**: Requires same-origin access. Blocked by sandbox.
- **Server-side Puppeteer screenshot**: Accurate but adds heavyweight dependency and server load. Rejected for complexity.
- **`dom-to-image` / `modern-screenshot`**: Less established than `html2canvas`, smaller community. Rejected for reliability.

---

## R3: Video Recording — DOM Event Recording vs Pixel Capture

**Decision**: Use `rrweb` for DOM-level recording inside the iframe, with `rrweb-player` for playback.

**Rationale**: Traditional video capture (`MediaRecorder` + `getDisplayMedia`) either requires user permission to share screen (poor UX) or same-origin canvas access (blocked by sandbox). `rrweb` takes a different approach — it records DOM mutations, mouse movements, and interactions as a JSON event stream. Benefits:

- Lightweight recording (~50KB for rrweb-record module)
- Lossless — captures exact DOM state changes, not lossy pixels
- Tiny file sizes compared to video (JSON events vs encoded video)
- Seekable, interactive replay via `rrweb-player`
- No same-origin requirement — injected script has full DOM access
- Export to WebM possible by recording rrweb-player playback via `MediaRecorder`

The bridge script loads `rrweb-record`, starts/stops recording on command from the parent, and streams events back via `postMessage`. The parent stores events and provides `rrweb-player` for playback.

**Alternatives considered**:
- **`getDisplayMedia()` + `MediaRecorder`**: Requires user to pick a screen/window — poor UX, captures more than just the preview. Rejected.
- **Canvas frame-by-frame with `html2canvas`**: Too slow for real-time video (html2canvas is ~100-500ms per frame). Rejected for performance.
- **Puppeteer server-side recording**: Heavy, high latency, complex. Rejected.

---

## R4: Image Upload — Delivery Mechanism to Claude

**Decision**: Save uploaded images to the session's working directory, deliver file path reference to Claude via PTY stdin.

**Rationale**: Claude Code can read images from the local filesystem. The existing comment delivery pattern (store in DB → compose message → write to PTY stdin) is proven and reliable. For images:

1. Frontend uploads via multipart form data to new endpoint
2. Backend saves to session's working directory under `.c3-uploads/` subdirectory
3. Backend stores metadata in `uploaded_images` table
4. On delivery: compose message like `[Image: /path/to/image.png] User says: "Please look at this design mockup and implement it"` and write to PTY stdin
5. Claude Code reads the image from the filesystem path

File storage in the working directory (vs. a central uploads directory) ensures the image is accessible to Claude's sandboxed process and is cleaned up with the session.

**Alternatives considered**:
- **Base64 inline in PTY message**: Large images would flood stdin, potential buffer issues. Rejected.
- **Separate upload API that Claude calls**: Would require Claude to know about the upload API. Rejected for complexity.
- **WebSocket binary frames**: Adds complexity to the message protocol. Rejected.

---

## R5: Custom Resolution — Scaling Strategy

**Decision**: Extend `ViewportMode` to `'desktop' | 'mobile' | 'custom'`, use CSS `transform: scale()` when custom resolution exceeds panel dimensions.

**Rationale**: The existing viewport system renders mobile at fixed 360x640 inside a phone bezel. Custom resolution follows the same pattern — render the iframe at the exact requested dimensions, then apply a CSS scale transform to fit within the available panel space. This ensures:

- CSS media queries fire at the correct (unscaled) dimensions
- The developer sees a pixel-accurate representation of the target resolution
- No content clipping when resolution exceeds panel size
- Smooth transition between standard and custom viewport modes

Panel state gains two new fields: `customViewportWidth` and `customViewportHeight`. The new `set-preview-resolution` board command updates these fields. A new agent skill script (`set-preview-resolution.sh`) invokes the board command.

**Alternatives considered**:
- **CSS `zoom` property**: Not standardized, inconsistent browser support. Rejected.
- **iframe `width`/`height` attributes only**: Would clip content when resolution exceeds panel. Rejected.
- **Server-side rendering at target resolution**: Overkill for viewport simulation. Rejected.

---

## R6: Annotation Tools — Library vs Custom

**Decision**: Build lightweight custom canvas annotation tools (arrow, rectangle, freehand, text).

**Rationale**: Annotation tools for screenshots are a focused, bounded feature set. The four required tools (arrow, rectangle, freehand draw, text) are straightforward canvas operations. Using a library would add unnecessary dependency weight and configuration complexity for what amounts to ~200 lines of canvas drawing code.

Implementation: After screenshot capture, display the image on an HTML5 `<canvas>` element with an overlay toolbar. Each tool modifies canvas state via mouse event handlers. Export the annotated canvas as a PNG data URL.

**Alternatives considered**:
- **Fabric.js** (~300KB): Full-featured canvas library. Overkill for 4 simple tools. Rejected for bundle size.
- **Konva.js** (~150KB): Similar concern. Rejected.
- **tldraw**: Interactive whiteboard library. Way too heavy. Rejected.

---

## R7: Bridge Script Injection — Proxy Modification Strategy

**Decision**: Inject bridge script tag into HTML responses at the proxy level, served as a static asset.

**Rationale**: The backend proxy routes already intercept and modify HTTP responses (stripping X-Frame-Options, CSP headers). Extending this to inject a `<script>` tag before `</head>` or `</body>` is a minimal change. The bridge script itself is served from a new static endpoint (`/api/inspect-bridge.js`) so it's cached by the browser and not re-transmitted with every proxied page.

Injection approach:
1. Check if response `Content-Type` is `text/html`
2. Buffer the response body
3. Insert `<script src="/api/inspect-bridge.js"></script>` before `</head>` (or append to body if no `</head>`)
4. Update `Content-Length` header
5. Send modified response

This only affects HTML documents — CSS, JS, images, fonts pass through unmodified.

**Alternatives considered**:
- **Inject inline script**: Would be blocked by some CSP policies (if we didn't strip them). Larger payload per page load. Rejected.
- **Service Worker interception**: Complex, requires `allow-same-origin`. Rejected.
- **Browser extension**: Not applicable — this is a web-based IDE. Rejected.

---

## Dependencies

| Package | Purpose | Size (gzipped) | License |
|---------|---------|-----------------|---------|
| `html2canvas` | DOM-to-canvas screenshot capture | ~40KB | MIT |
| `rrweb` | DOM mutation recording (record module) | ~50KB | MIT |
| `rrweb-player` | Recording playback component | ~80KB | MIT |
| `multer` | Multipart form data parsing for image upload | ~12KB | MIT |

All packages are actively maintained, have TypeScript support, and MIT licensed. Total new dependency budget: ~182KB gzipped (loaded on demand, not in initial bundle).
