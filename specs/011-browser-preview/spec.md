# Feature Specification: Preview Visual Feedback & Media

**Feature Branch**: `011-browser-preview`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Preview browser control by agent with video recording, element selection & commenting, photo upload to session, custom resolution via skills"

## Existing Foundation

The IDE already provides the following capabilities that this feature builds upon:

- **Live preview browser** (`LivePreview.tsx`) — iframe-based preview with URL navigation, auto-refresh on file changes, proxy routes for local/external URLs
- **Mobile viewport mode** — 360x640px mobile frame with device chrome (notch, home indicator)
- **Desktop viewport mode** — full-width iframe rendering
- **Agent `open-preview` skill** — opens the preview panel and navigates to a URL via board command
- **Board command protocol** — `POST /api/sessions/:id/board-command` + WebSocket broadcast pattern for agent-to-UI communication
- **4 existing agent skills** — `open-file`, `open-preview`, `show-panel`, `show-diff`

This spec covers **new capabilities** layered on top of the existing preview infrastructure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Element Selection & Visual Commenting (Priority: P1)

As a developer, I want to click on any element in the preview browser to select it and attach a comment, so I can visually communicate design feedback, bug reports, or change requests to the Claude agent.

When the user enters "inspect mode" in the preview, hovering over elements highlights them. Clicking an element selects it and opens a comment input. The comment is sent to the Claude session along with context about which element was selected (its visual position, bounding box, and a screenshot of the area). Multiple comments can exist simultaneously on a single view, displayed as numbered pins on the preview.

**Why this priority**: Visual commenting is the highest-value new capability. It transforms the existing preview from a passive display into an interactive feedback tool, enabling precise, contextual communication about specific UI elements. This is the core differentiator for the feature set.

**Independent Test**: Can be tested by entering inspect mode, clicking an element, typing a comment, and verifying the comment appears as a pin on the preview and is delivered to the Claude session with element context.

**Acceptance Scenarios**:

1. **Given** the preview is showing a page, **When** the user activates inspect mode, **Then** hovering over elements highlights them with a visible outline and shows element identification.
2. **Given** inspect mode is active, **When** the user clicks an element, **Then** a comment input appears anchored to that element.
3. **Given** the comment input is open, **When** the user types a message and submits, **Then** a numbered pin appears at the element's position on the preview overlay.
4. **Given** a comment has been submitted, **When** the Claude session receives it, **Then** it includes the comment text, a cropped screenshot of the selected element area, and the element's position within the page.
5. **Given** multiple comments exist on a view, **When** the user looks at the preview, **Then** all comment pins are visible, numbered sequentially, and clickable to view their content.
6. **Given** comments exist on a view, **When** the user clicks an existing comment pin, **Then** the comment content is displayed in a popover.

---

### User Story 2 - Image Upload to Session (Priority: P2)

As a developer, I want to upload images (screenshots, design mockups, photos of whiteboard sketches) directly into my Claude session so the agent can see exactly what I'm referring to and act on visual information.

The user can drag-and-drop or use a file picker to send images to the active Claude session. Uploaded images are displayed inline in the chat and are visible to the agent for analysis. Supported formats include PNG, JPG, GIF, and WebP.

**Why this priority**: Image upload enables a critical communication channel -- users often have reference designs, bug screenshots from other devices, or mockups they want the agent to implement. This works independently of the preview browser and provides immediate value for any visual communication.

**Independent Test**: Can be tested by uploading an image via drag-and-drop or file picker, verifying it appears in the chat, and confirming the agent can describe or act on the image content.

**Acceptance Scenarios**:

1. **Given** an active Claude session, **When** the user drags an image file onto the chat area, **Then** the image is uploaded and displayed inline in the conversation.
2. **Given** an active session, **When** the user clicks an "attach image" button and selects a file, **Then** the image is uploaded and displayed inline.
3. **Given** an image has been uploaded, **When** the agent processes the message, **Then** the agent can see and analyze the image content.
4. **Given** the user attempts to upload an unsupported file type, **When** the upload is attempted, **Then** a clear error message indicates which formats are supported.
5. **Given** the user uploads a very large image (over 10MB), **When** the upload is processed, **Then** the image is automatically compressed to a reasonable size while maintaining sufficient quality for visual analysis.

---

### User Story 3 - Custom Preview Resolution via Agent Skill (Priority: P3)

As a developer, I want the agent (or myself via toolbar controls) to set the preview browser to any custom resolution so I can test my application at specific dimensions beyond the existing mobile/desktop toggle.

The existing viewport toggle only supports two modes: desktop (full-width) and mobile (360x640). This story extends that to support arbitrary width x height values. A new agent skill (`set-preview-resolution`) allows the agent to programmatically change the preview resolution — for example, when testing a specific breakpoint or matching a design mockup's dimensions. The preview toolbar also gains a custom resolution input for manual control.

**Why this priority**: Custom resolution control directly enhances the existing preview and is a lightweight addition to the skills system. It enables the agent to intelligently test at relevant breakpoints during development, and gives users fine-grained control without leaving the IDE.

**Independent Test**: Can be tested by invoking the `set-preview-resolution` skill with a custom width/height, verifying the preview renders at those dimensions, and confirming CSS media queries respond correctly.

**Acceptance Scenarios**:

1. **Given** the preview is open, **When** the agent invokes the `set-preview-resolution` skill with width 768 and height 1024, **Then** the preview content renders at 768x1024 within the panel.
2. **Given** the preview is open, **When** the user enters custom width and height values in the toolbar, **Then** the preview resizes to match those dimensions.
3. **Given** a custom resolution is set, **When** the user inspects the rendered page, **Then** CSS media queries respond correctly to the new viewport size.
4. **Given** the preview is at a custom resolution, **When** the user clicks the existing mobile or desktop toggle, **Then** the preview switches back to the standard mode, overriding the custom resolution.
5. **Given** the agent is building a responsive layout, **When** it needs to verify a specific breakpoint, **Then** it can set the resolution, capture the preview state, and adjust code accordingly.

---

### User Story 4 - Preview Screenshot Capture (Priority: P4)

As a developer, I want to capture a screenshot of the current preview state and optionally annotate it before sending it to the Claude session or saving it locally.

A screenshot button in the preview toolbar captures the current viewport. The user can optionally draw annotations (arrows, rectangles, text) on the screenshot before sending it to the session or downloading it.

**Why this priority**: Screenshots provide a quick way to capture and share the current state without the overhead of video recording. They serve as lightweight visual documentation and complement the element commenting feature.

**Independent Test**: Can be tested by clicking the screenshot button, verifying a capture is taken, optionally annotating it, and confirming it can be sent to the session or saved.

**Acceptance Scenarios**:

1. **Given** the preview is showing a page, **When** the user clicks the screenshot button, **Then** the current viewport is captured as an image.
2. **Given** a screenshot has been captured, **When** the user chooses to annotate, **Then** basic drawing tools (arrow, rectangle, freehand, text) are available.
3. **Given** a screenshot (annotated or not), **When** the user sends it to the session, **Then** it appears in the chat and the agent can analyze it.
4. **Given** a screenshot, **When** the user chooses to save locally, **Then** it downloads as a PNG file.

---

### User Story 5 - Video Recording & Playback (Priority: P5)

As a developer, I want to record a video of my interactions in the preview browser so I can capture bug reproduction steps, demonstrate desired behaviors, or create visual documentation of the application's current state.

The user clicks a record button to start capturing the preview browser's content. While recording, a visual indicator shows the recording is active. When stopped, the video is saved and can be played back within the IDE, sent to the Claude session for analysis, or downloaded.

**Why this priority**: Video recording captures temporal interactions (animations, multi-step flows, race conditions) that screenshots and comments cannot. It is the most complex feature and builds on the preview browser foundation. Prioritized last because screenshots and comments cover most feedback scenarios.

**Independent Test**: Can be tested by starting a recording, interacting with the preview for a few seconds, stopping the recording, and verifying the video plays back correctly and can be sent to the session.

**Acceptance Scenarios**:

1. **Given** the preview is showing a page, **When** the user clicks the record button, **Then** recording begins and a visual indicator (red dot, timer) is displayed.
2. **Given** recording is active, **When** the user interacts with the preview, **Then** all interactions (clicks, scrolls, typing, page transitions) are captured in the video.
3. **Given** recording is active, **When** the user clicks stop, **Then** the recording stops and a video player appears with playback controls.
4. **Given** a recorded video, **When** the user chooses to send it to the session, **Then** the video is attached to the conversation and the agent can reference it.
5. **Given** a recorded video, **When** the user chooses to download, **Then** the video downloads in a standard format (WebM or MP4).
6. **Given** the recording has been running for over 5 minutes, **When** the 5-minute limit is reached, **Then** the recording automatically stops and the user is notified.

---

### Edge Cases

- What happens when comments reference elements that no longer exist after a code change? Orphaned comments remain visible with a "stale" indicator, positioned at their last known location.
- What happens when recording a video and the preview refreshes? Recording continues seamlessly through page refreshes.
- What happens when uploading an image in an unsupported format? A clear error message lists supported formats (PNG, JPG, GIF, WebP).
- What happens when multiple users view the same session's comments? Comments are shared across all viewers of the session in real-time.
- What happens if the preview browser's content is too large to capture as a screenshot? Only the visible viewport is captured, with an option to capture the full scrollable page.
- What happens when the agent sets a resolution larger than the panel? The preview scales down to fit within the panel while maintaining the correct aspect ratio and CSS media query behavior.
- What happens when the agent sets an invalid resolution (zero, negative, extremely large)? The system rejects invalid values and returns an error to the agent, keeping the current resolution unchanged.
- What happens when the user submits a comment while the preview is refreshing? The comment submission is queued and applied once the preview finishes loading.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an inspect mode where hovering over page elements in the preview highlights them with a visible outline.
- **FR-002**: System MUST allow users to select an element in inspect mode and attach a text comment to it.
- **FR-003**: System MUST display submitted comments as numbered pins on the preview overlay, positioned at the selected element's location.
- **FR-004**: System MUST send comments to the Claude session including: comment text, a cropped screenshot of the element area, and the element's position context.
- **FR-005**: System MUST support multiple simultaneous comments on a single preview view.
- **FR-006**: System MUST allow users to view existing comments by clicking their pins, showing the content in a popover.
- **FR-007**: System MUST mark comments as "stale" when the elements they reference are no longer found after a page update.
- **FR-008**: System MUST preserve comment pin positions relative to the elements they annotate, even when the viewport is resized.
- **FR-009**: System MUST allow users to upload images (PNG, JPG, GIF, WebP) to the Claude session via drag-and-drop or file picker.
- **FR-010**: System MUST display uploaded images inline in the conversation.
- **FR-011**: System MUST make uploaded images visible and analyzable by the Claude agent.
- **FR-012**: System MUST automatically compress images larger than 10MB while maintaining sufficient visual quality.
- **FR-013**: System MUST provide a new agent skill (`set-preview-resolution`) that accepts custom width and height parameters and changes the preview viewport dimensions.
- **FR-014**: System MUST extend the existing `ViewportMode` to support a `custom` mode with arbitrary width and height values, in addition to the existing `desktop` and `mobile` modes.
- **FR-015**: System MUST provide custom resolution input controls in the preview toolbar for manual width/height entry.
- **FR-016**: System MUST scale the preview content to fit within the panel when the specified resolution exceeds available panel space, while maintaining correct CSS media query behavior.
- **FR-017**: System MUST provide a screenshot capture button that saves the current preview viewport as an image.
- **FR-018**: System MUST provide basic annotation tools (arrow, rectangle, freehand, text) for captured screenshots.
- **FR-019**: System MUST allow users to start and stop video recording of the preview browser content.
- **FR-020**: System MUST display a visual recording indicator while recording is active.
- **FR-021**: System MUST provide in-IDE video playback with standard controls (play, pause, seek).
- **FR-022**: System MUST enforce a maximum recording duration of 5 minutes per clip.
- **FR-023**: System MUST allow recorded videos to be sent to the Claude session or downloaded locally.

### Key Entities

- **Visual Comment**: A user annotation anchored to a specific element on the preview -- includes comment text, element position, cropped screenshot, timestamp, and status (active/stale).
- **Screenshot Capture**: A point-in-time image of the preview viewport -- may include user annotations (arrows, shapes, text).
- **Video Recording**: A captured video of preview browser interactions -- includes duration, file size, and association with the session.
- **Uploaded Image**: A user-provided image file sent to the Claude session -- includes original filename, format, dimensions, and compressed version if applicable.
- **Custom Viewport**: A user- or agent-defined preview resolution -- includes width, height, and optional label. Extends the existing `ViewportMode` type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select any visible element and submit a comment in under 10 seconds.
- **SC-002**: The Claude agent receives visual context (screenshot + position) with every element comment, enabling accurate understanding of user intent.
- **SC-003**: Users can upload an image and have it visible in the session within 3 seconds for images under 5MB.
- **SC-004**: Users can capture a screenshot, annotate it, and send it to the session in under 30 seconds.
- **SC-005**: Users can record up to 5 minutes of preview interaction and play it back without quality loss.
- **SC-006**: The agent can set the preview to any custom resolution via the `set-preview-resolution` skill and the preview renders content at those dimensions.
- **SC-007**: 90% of visual comments are accurately positioned at the intended element on first attempt.
- **SC-008**: Custom resolutions correctly trigger CSS media queries matching the specified dimensions.

## Assumptions

- The existing preview browser (`LivePreview.tsx`), proxy routes, and board command protocol are stable and require no changes to their core behavior.
- The existing `open-preview` skill and `ViewportMode` type (`'desktop' | 'mobile'`) serve as the extension points for custom resolution support.
- The Claude agent supports multimodal input (images) in the session protocol.
- Video sent to the session will be processed as a series of key frames rather than full video analysis (current model limitations).
- Comments are scoped to the current session and are not persisted across IDE restarts unless explicitly saved.
- Image compression targets approximately 2MB for images over 10MB, balancing quality with upload speed.
- The preview browser operates in a sandboxed iframe context; inspect mode and comment overlays are rendered in the parent frame above the iframe, not injected into it.
