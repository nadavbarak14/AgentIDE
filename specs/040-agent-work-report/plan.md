# Implementation Plan: Agent Work Report

**Branch**: `040-agent-work-report` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/040-agent-work-report/spec.md`

## Summary

Add a new `work-report` extension that lets the agent produce an HTML work report with attached screenshots, videos, and diffs. The report is rendered in a dedicated extension panel and can be exported to a GitHub PR with uploaded media. The agent writes the HTML directly — we provide helper skills for attaching media and exporting.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, Tailwind CSS 3, Vite 6, ws 8, chokidar 4 (all existing)
**Storage**: Filesystem only — `report.html` + `.report-assets/` in session working directory. No database changes.
**Testing**: Vitest 2.1.0, supertest, @testing-library/react, @testing-library/jest-dom (all existing)
**Target Platform**: Linux server (Node.js backend) + web browser (React frontend)
**Project Type**: Web application (backend + frontend + extension)
**Performance Goals**: Report panel refresh within 2s of file change (SC-002)
**Constraints**: Maximum 5 new skills (SC-005). No new npm dependencies.
**Scale/Scope**: 1 extension, 4 skills, ~15 files total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for skills (bash scripts), integration tests for file serving, system tests for extension rendering |
| II. UX-First Design | PASS | Extension panel provides visual report; empty state when no report; auto-refresh on changes |
| III. UI Quality & Consistency | PASS | Extension uses existing panel system; empty state matches other panels |
| IV. Simplicity | PASS | No database, no new dependencies, agent writes HTML directly, 4 skills total |
| V. CI/CD Pipeline | PASS | Standard branch → PR → CI → rebase-merge workflow |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies |
| VII. Backend Security | PASS | File serving uses existing sanitizePath; path traversal protection inherited |
| VIII. Observability | PASS | Skills log to stdout/stderr; backend routes already logged |

**Post-Phase 1 re-check**: No violations. Design stays within all constitutional bounds.

## Project Structure

### Documentation (this feature)

```text
specs/040-agent-work-report/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── skills-api.md    # Skill invocation contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
extensions/work-report/
├── manifest.json
├── ui/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── skills/
    ├── report.attach-screenshot/
    │   ├── SKILL.md
    │   └── scripts/report.attach-screenshot.sh
    ├── report.attach-video/
    │   ├── SKILL.md
    │   └── scripts/report.attach-video.sh
    ├── report.attach-diff/
    │   ├── SKILL.md
    │   └── scripts/report.attach-diff.sh
    └── report.export-github/
        ├── SKILL.md
        └── scripts/report.export-github.sh

backend/src/
└── services/session-manager.ts      # Modified: add report cleanup on session end

frontend/src/
└── components/SessionCard.tsx        # Modified: forward file_changed to extension when report.html changes

tests/
├── unit/
│   └── work-report-skills.test.ts    # Skill script tests
├── integration/
│   └── work-report-extension.test.ts # Extension loading + file serving
└── system/
    └── work-report-e2e.test.ts       # Full workflow test
```

**Structure Decision**: Web application pattern (existing). The extension lives in `extensions/work-report/` alongside the existing `frontend-design` extension. Backend and frontend changes are minimal — just cleanup hooks and event forwarding.

## Implementation Phases

### Phase 1: Extension Shell + Report Rendering (P1 Core)

**Goal**: Extension panel that renders `report.html` from the session directory.

**Tasks**:
1. Create `extensions/work-report/manifest.json` following the frontend-design pattern
2. Create `extensions/work-report/ui/index.html` — minimal HTML entry point
3. Create `extensions/work-report/ui/styles.css` — panel styling (dark theme matching IDE)
4. Create `extensions/work-report/ui/app.js` — core logic:
   - Listen for `init` message from host to get sessionId
   - Fetch `report.html` from `/api/sessions/{sessionId}/serve/report.html`
   - Render in nested iframe (srcdoc or direct src) to isolate report styles
   - Show empty state when report doesn't exist (404)
   - Send `ready` message to host
5. Modify `frontend/src/components/SessionCard.tsx`:
   - When `file_changed` event includes `report.html`, forward `report.file_changed` board command to extension
6. Handle `report.file_changed` board command in extension `app.js` — reload the report

**Acceptance**: Agent creates `report.html` in session dir → extension panel auto-renders it. File changes trigger refresh within 2s.

### Phase 2: Attachment Skills (P1 Supporting)

**Goal**: Skills for copying media to `.report-assets/` and getting diffs.

**Tasks**:
1. Create `report.attach-screenshot` skill:
   - SKILL.md with usage docs
   - Bash script: validate source exists + is image, mkdir -p `.report-assets/`, cp with timestamp prefix, echo relative path
2. Create `report.attach-video` skill:
   - Same pattern as screenshot but for video files (webm, mp4)
3. Create `report.attach-diff` skill:
   - SKILL.md with usage docs
   - Bash script: run `git diff` with passed arguments (default: HEAD), output to stdout
4. Unit tests for each skill script (file copy, path output, error cases)

**Acceptance**: Each skill copies files correctly, returns valid relative paths, handles errors gracefully.

### Phase 3: GitHub Export Skill (P2)

**Goal**: Convert report to GitHub PR body with uploaded media.

**Tasks**:
1. Create `report.export-github` skill:
   - SKILL.md with usage docs
   - Bash script (or Node.js helper for HTML parsing):
     a. Read `report.html`
     b. Extract `<img src>` and `<video src>` references
     c. For each image: upload to GitHub via `gh` API, get hosted URL
     d. For each video: convert WebM→mp4 via ffmpeg (if available), upload
     e. Convert HTML structure to markdown (headings, paragraphs, code blocks, media embeds)
     f. Output complete markdown to stdout
2. Integration test: create report with media, run export, verify markdown output

**Acceptance**: Export produces valid GitHub markdown with uploaded media URLs. Works with text-only reports. Gracefully handles missing ffmpeg.

### Phase 4: Session Cleanup (P3)

**Goal**: Clean up report files when session ends.

**Tasks**:
1. Modify `backend/src/services/session-manager.ts`:
   - In session completion/deletion handler, delete `report.html` and `.report-assets/` from working directory
   - Use `fs.rm` with `{ recursive: true, force: true }` for the assets directory
2. Integration test: create session with report + assets, end session, verify cleanup

**Acceptance**: No orphaned report files after session cleanup.

### Phase 5: Testing + Polish

**Goal**: Comprehensive test coverage per constitution principle I.

**Tasks**:
1. Unit tests:
   - Skill scripts (attach-screenshot, attach-video, attach-diff, export-github)
   - Extension manifest validation
2. Integration tests:
   - Extension loads and appears in panel picker
   - Report file served correctly via existing serve route
   - File change events trigger extension refresh
   - Session cleanup removes report artifacts
3. System tests:
   - Full workflow: agent creates report → visible in panel → exported to PR body
4. Manual testing per quickstart.md

**Acceptance**: All tests pass. `npm test && npm run lint` green.
