# Implementation Plan: Extension System

**Branch**: `012-extension-system` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-extension-system/spec.md`

## Summary

Add a frontend-only extension system that lets developers create extensions with custom UI panels and agent skills by dropping a folder with a manifest into the `extensions/` directory. No backend changes. Extensions render in iframes, communicate via a postMessage bridge, and register skills as files. Every extension with a panel automatically gets three built-in skills (`<ext-name>.open`, `<ext-name>.comment`, `<ext-name>.select-text`) generated at registration time. Extensions can additionally declare custom skills. Includes a "Frontend Design" test extension that displays agent-generated HTML screens with per-element commenting and text selection feedback.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Vite 6, Tailwind CSS 3 (existing); no new dependencies
**Storage**: N/A — no database changes; extension state held in React component state only
**Testing**: Vitest 2.1.0, @testing-library/react, @testing-library/jest-dom (existing)
**Target Platform**: Web (Chrome, Firefox, Safari — latest versions)
**Project Type**: Web application (frontend changes only)
**Performance Goals**: Extension panel renders within 1s; board commands reach iframe within 500ms
**Constraints**: Zero backend code changes; extensions are purely frontend artifacts; must not break existing panel system
**Scale/Scope**: Support 1-10 extensions loaded simultaneously; Frontend Design extension supports 10+ screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for extension loader, manifest parser, postMessage bridge (Phase 2-7). System tests for end-to-end extension discovery, postMessage round-trip, skill registration, and Frontend Design extension (Phase 8: T045-T048). |
| II. UX-First Design | PASS | User stories define flows before implementation. Extension panel integrates into existing panel picker UX. Inspect mode follows established browser DevTools patterns. |
| III. UI Quality & Consistency | PASS | Extension panels use same panel header/dropdown as built-in panels. Frontend Design extension follows existing Tailwind design language. |
| IV. Simplicity | PASS | No new abstractions beyond manifest convention + iframe + postMessage. No new dependencies. Extensions are just folders with HTML and JSON. |
| V. CI/CD Pipeline | PASS | New tests added to existing CI pipeline. No CI changes needed. |
| VI. Frontend Plugin Quality | PASS | No new frontend plugins. Uses only browser-native APIs (postMessage, iframe, MutationObserver). |
| VII. Backend Security | PASS | No backend changes. Extension iframes are sandboxed (allow-scripts only). postMessage origin validation on host side. |
| VIII. Observability & Logging | PASS | Console warnings for invalid manifests, failed extension loads, and malformed postMessages. Extension events logged at debug level. |

**Gate Result: ALL PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/012-extension-system/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 API contracts
│   └── postmessage-protocol.md
└── tasks.md             # Phase 2 tasks (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   └── ExtensionPanel.tsx          # Generic iframe panel for extensions
│   ├── hooks/
│   │   ├── useExtensions.ts            # Extension discovery and manifest loading
│   │   └── usePostMessageBridge.ts     # postMessage communication hook
│   └── services/
│       └── extension-loader.ts         # Manifest parsing, validation, registration
├── tests/
│   └── unit/
│       ├── extension-loader.test.ts
│       ├── auto-skill-generator.test.ts
│       ├── useExtensions.test.ts
│       └── postmessage-bridge.test.ts
└── vite-plugin-extensions.ts           # Vite plugin: serves extensions, generates index.json

scripts/
└── auto-skill-generator.ts            # Generates open/comment/select-text skill files per extension (Node script, writes to disk)

extensions/                             # Extension directory (project root)
└── frontend-design/                    # Test extension
    ├── manifest.json
    ├── ui/
    │   ├── index.html                  # Extension entry point
    │   ├── app.js                      # Extension logic (vanilla JS or bundled)
    │   └── styles.css                  # Extension styles
    └── skills/
        ├── design-add-screen/
        │   ├── SKILL.md
        │   └── scripts/
        │       └── design-add-screen.sh
        ├── design-update-screen/
        │   ├── SKILL.md
        │   └── scripts/
        │       └── design-update-screen.sh
        └── design-remove-screen/
            ├── SKILL.md
            └── scripts/
                └── design-remove-screen.sh
```

**Structure Decision**: Frontend-only changes. Extension infrastructure lives in `frontend/src/` (components, hooks, services). The `extensions/` directory at project root contains the actual extensions. Vite plugin generates `extensions/index.json` at dev-server start and build time (solves browser directory scanning). `auto-skill-generator.ts` lives in `scripts/` (not frontend) because it writes skill files to disk — a Node.js build-time operation. No backend directory changes.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
