# Research: Agent Work Report

## R1: Extension Panel Architecture

**Decision**: Follow the existing `frontend-design` extension pattern exactly.

**Rationale**: The extension system is well-established with manifest.json, ui/ folder (static HTML/CSS/JS), and skills/ folder (SKILL.md + bash scripts). No build step needed — the backend's `/api/extensions` endpoint scans the `extensions/` directory at runtime.

**Alternatives considered**:
- New panel type (rejected — extension system already handles this cleanly)
- Widget/canvas approach (rejected — canvas is ephemeral, single-use; extensions persist in the panel)

## R2: Rendering the Report in the Extension Panel

**Decision**: The extension UI fetches `report.html` from `/api/sessions/:id/serve/report.html` and renders it via an inner iframe with `srcdoc` or by navigating to the serve URL directly. Media assets in `.report-assets/` are served via the same route.

**Rationale**: The existing file-serving route (`GET /api/sessions/:id/serve/*`) already serves files from the session's working directory with proper MIME types. No new backend routes needed for rendering.

**Alternatives considered**:
- Injecting HTML into the extension DOM (rejected — risks CSS/JS conflicts between extension chrome and report content)
- New dedicated file-serving endpoint (rejected — existing serve route works perfectly)

## R3: Auto-Refresh on File Changes

**Decision**: The host (SessionCard) already receives `file_changed` WebSocket events from FileWatcher. When `report.html` is in the changed files list, forward a board command (`report.file_changed`) to the extension iframe. The extension reloads the report.

**Rationale**: Reuses existing infrastructure. FileWatcher already monitors session directories with chokidar (200ms stabilization, 500ms debounce). No new watchers needed.

**Alternatives considered**:
- Extension polls the serve endpoint (rejected — wasteful; WebSocket events already exist)
- Direct WebSocket from extension iframe (rejected — extension runs in sandboxed iframe, host already has the connection)

## R4: Media Attachment Skills

**Decision**: Skills copy files to `.report-assets/` in the session's working directory and return relative paths. The agent embeds these paths in the HTML (`<img src=".report-assets/screenshot-1.png">`).

**Rationale**: Simple file copy + path return. The serve route already resolves relative paths within the working directory. No database tables needed.

**Details**:
- `.report-assets/` created on first attachment
- Files copied (not moved) so originals remain in `.c3-uploads/` for existing features
- Unique filenames via timestamp or UUID prefix to avoid collisions

**Alternatives considered**:
- Symlinks to .c3-uploads (rejected — fragile, cross-device issues)
- Serving from .c3-uploads directly (rejected — different directory semantics, couples report to upload internals)

## R5: Diff Attachment

**Decision**: The diff skill runs `git diff` in the session's working directory and returns the raw diff text. The agent can embed it in a `<pre>` block or use diff2html (already a project dependency) for rich rendering.

**Rationale**: The agent writes the HTML — it decides how to render the diff. The skill just provides the raw material.

**Alternatives considered**:
- Skill returns pre-rendered HTML diff (rejected — removes agent's creative control over presentation)
- Skill saves diff as file to .report-assets (rejected — unnecessary; diff text can be returned directly to stdout)

## R6: GitHub Export

**Decision**: The export skill parses report.html, extracts media references (`<img src>`, `<video src>`), uploads each to GitHub via the `gh` CLI (which is available in the agent's environment), converts HTML to markdown, and outputs the PR-ready body.

**Rationale**: `gh` CLI handles authentication and asset uploads. GitHub supports image uploads via issue/PR comment API (images uploaded inline render as `https://github.com/user-attachments/assets/...` URLs). Videos as mp4 can be uploaded the same way.

**Upload mechanism**: `gh` CLI can upload release assets, but for PR body images the standard approach is to use the GitHub user-content upload API. The skill can use `curl` to POST images to `https://github.com/upload/policies/assets` (same mechanism as drag-and-drop in GitHub UI).

**Alternatives considered**:
- GitHub Release Assets (rejected — creates unnecessary releases, wrong abstraction)
- GitHub Gist for hosting (rejected — extra complexity, images not well-supported)

## R7: Video Format Conversion

**Decision**: Use `ffmpeg` for WebM-to-mp4 conversion. Check availability at runtime; if not present, skip video or warn the agent.

**Rationale**: ffmpeg is the standard tool for video conversion. It's commonly available on development machines and CI environments.

**Alternatives considered**:
- Node.js-based conversion library (rejected — adds heavy dependency, ffmpeg is more reliable)
- Skip conversion, upload WebM directly (rejected — GitHub doesn't render WebM inline in PR descriptions)

## R8: Session Cleanup

**Decision**: Hook into the existing session completion/deletion flow to remove `report.html` and `.report-assets/` from the working directory.

**Rationale**: Currently, session file cleanup doesn't remove working directory contents (since it's the user's project). But report artifacts are our files, not user files — they should be cleaned up.

**Implementation**: In the session completion handler, add a step that deletes `report.html` and `.report-assets/` if they exist in the session's working directory.

**Alternatives considered**:
- Leave cleanup to the user (rejected — violates spec requirement SC-004)
- Store report outside working directory (rejected — complicates file serving and relative paths)
