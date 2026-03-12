# Tasks: Mobile Preview UX Fixes

**Input**: Design documents from `/specs/036-mobile-preview-fixes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: User Story 1 - Screenshot Annotation Modal Mobile Fix (Priority: P1) MVP

**Goal**: Make the screenshot annotation modal usable on mobile by restructuring the toolbar layout to keep Save/Cancel visible, adding touch event support for annotation drawing, and scaling the canvas to fit within the mobile viewport.

**Independent Test**: Open the app on a mobile device (or DevTools mobile emulation at 375px width), capture a screenshot via the camera button, and verify: (1) all toolbar controls (tools, colors, undo, save, cancel) are visible without scrolling, (2) the Save button is tappable and works, (3) drawing annotations works via touch.

### Implementation for User Story 1

- [x] T001 [US1] Restructure the annotation toolbar for mobile-responsive layout — detect narrow viewport (< 640px) and render a compact two-row toolbar with Save/Cancel always visible at top. Use `flex-wrap` and responsive ordering so tools + colors flow to a second row on small screens. File: `frontend/src/components/AnnotationCanvas.tsx`
- [x] T002 [US1] Add touch event handlers to the annotation canvas — implement `onTouchStart`, `onTouchMove`, `onTouchEnd` that extract coordinates from `e.touches[0]` and delegate to existing drawing logic via `getCanvasPos`. Add `touch-action: none` CSS to prevent browser scroll during drawing. File: `frontend/src/components/AnnotationCanvas.tsx`
- [x] T003 [US1] Scale the canvas image to fit within the mobile viewport — after toolbar renders, constrain the canvas `max-height` to remaining viewport space (accounting for the potentially multi-line toolbar height). Ensure the image maintains aspect ratio using `object-fit: contain` or equivalent max-width/max-height constraints. File: `frontend/src/components/AnnotationCanvas.tsx`

**Checkpoint**: At this point, the screenshot workflow should be fully functional on mobile devices. All controls visible, touch drawing works, Save button accessible.

---

## Phase 2: User Story 2 - Fullscreen Preview Mode (Priority: P2)

**Goal**: Add a fullscreen toggle to the preview that hides all IDE chrome (toolbar, address bar, device frame bezels) and expands the preview iframe to fill the entire screen. Provide a clear exit mechanism.

**Independent Test**: Load a preview, click the fullscreen button in the overlay toolbar, verify the iframe fills the entire screen with no chrome visible. Click the exit button (or press Escape) and verify normal view is restored.

### Implementation for User Story 2

- [x] T004 [P] [US2] Add fullscreen toggle button to the PreviewOverlay toolbar — add a new button (expand icon) next to the existing inspect/screenshot/record buttons. Accept `isFullscreen` and `onToggleFullscreen` props. When active, show a "collapse" icon variant. File: `frontend/src/components/PreviewOverlay.tsx`
- [x] T005 [US2] Add fullscreen state and overlay rendering to LivePreview — add `isFullscreen` boolean state. When true, render the iframe in a `fixed inset-0 z-[60]` overlay container that covers the full viewport. Include a floating semi-transparent exit button at top-right and an Escape key handler. Pass `isFullscreen` and toggle callback to PreviewOverlay. The fullscreen iframe should render at 1:1 scale (no transform scaling). File: `frontend/src/components/LivePreview.tsx`

**Checkpoint**: At this point, users can enter and exit fullscreen preview mode on both mobile and desktop. The preview fills the full viewport with a single tap.

---

## Phase 3: User Story 3 - Desktop Resolution Minimum Scale Floor (Priority: P3)

**Goal**: Prevent desktop resolution previews from shrinking to unreadably small sizes by introducing a minimum scale floor of 0.35. When clamped, enable scroll/pan overflow so the user can still access the full preview.

**Independent Test**: Select a 4K preset (3840x2160) in a narrow panel (~400px wide), verify the preview doesn't shrink below readable size and the user can scroll to see overflow content. Then select a preset that fits the panel (e.g., 1280x720) and verify it renders at near 1:1 scale without unnecessary clamping.

### Implementation for User Story 3

- [x] T006 [US3] Add minimum scale floor constant and clamp desktop viewport scaling — define `const MIN_DESKTOP_SCALE = 0.35` and change the scale calculation from `Math.min(scaleX, scaleY, 1)` to `Math.max(Math.min(scaleX, scaleY, 1), MIN_DESKTOP_SCALE)`. When scale is clamped (equals MIN_DESKTOP_SCALE), ensure the parent container allows scrolling to access overflow content. File: `frontend/src/components/LivePreview.tsx` (desktop viewport section, ~line 682-711)
- [x] T007 [US3] Apply the same minimum scale floor to the custom viewport mode — update the custom viewport scaling logic to use the same `MIN_DESKTOP_SCALE` floor and enable scroll overflow when clamped. File: `frontend/src/components/LivePreview.tsx` (custom viewport section, ~line 659-680)

**Checkpoint**: All three user stories should now be independently functional. Desktop presets remain readable in narrow panels, scrolling works for oversized presets.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T008 Verify all three fixes work together — test the combined behavior: mobile annotation modal in fullscreen mode, desktop preset minimum scale with fullscreen toggle, and ensure no z-index conflicts between fullscreen overlay and annotation modal
- [x] T009 Run existing test suite (`npm test && npm run lint`) to verify no regressions introduced
- [ ] T010 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately (MVP)
- **User Story 2 (Phase 2)**: No dependencies on US1 — can start in parallel
- **User Story 3 (Phase 3)**: No dependencies on US1 or US2 — can start in parallel
- **Polish (Phase 4)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent. Modifies only `AnnotationCanvas.tsx`
- **User Story 2 (P2)**: Independent. Modifies `LivePreview.tsx` (new fullscreen state/overlay) + `PreviewOverlay.tsx` (new button)
- **User Story 3 (P3)**: Independent. Modifies `LivePreview.tsx` (scale calculation) — different code section than US2

### Parallel Opportunities

All three user stories can be executed in parallel since they modify different code sections:
- US1: `AnnotationCanvas.tsx` only
- US2: `LivePreview.tsx` (new fullscreen code) + `PreviewOverlay.tsx` (new button)
- US3: `LivePreview.tsx` (existing scale calculation section) — no overlap with US2's fullscreen code

---

## Parallel Example: All User Stories

```bash
# All three stories can launch in parallel:
Agent 1: "T001-T003: Mobile annotation modal fix in AnnotationCanvas.tsx"
Agent 2: "T004-T005: Fullscreen preview mode in PreviewOverlay.tsx + LivePreview.tsx"
Agent 3: "T006-T007: Min scale floor in LivePreview.tsx (scale calculation sections)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: User Story 1 (T001-T003)
2. **STOP and VALIDATE**: Test annotation modal on mobile viewport
3. Deploy/demo if ready — fixes the broken screenshot workflow

### Incremental Delivery

1. User Story 1 → Test on mobile → Deploy (broken workflow fixed!)
2. User Story 2 → Test fullscreen → Deploy (new feature added)
3. User Story 3 → Test desktop presets → Deploy (readability improved)
4. Polish → CI green → Merge

### Parallel Strategy

With subagent parallelism:
1. Launch all three user stories in parallel (different files/sections)
2. All stories complete → Run polish phase
3. CI green → Merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- No new dependencies, no backend changes, no database changes
- Total: 10 tasks across 4 phases (3 story phases + 1 polish phase)
- All 3 user stories can run in parallel — maximally parallelizable
