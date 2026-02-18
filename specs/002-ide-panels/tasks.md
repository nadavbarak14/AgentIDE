# Tasks: IDE Panels v4 — Dual Panel, Writable Files, Terminal Clipboard

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v4), spec.md (post-clarification v4), research.md (R15-R17)

**Context**: This is a v4 update. The v1-v3 code is committed and all 100 tests pass. Changes needed:
1. Dual-panel mode: Files LEFT + Terminal CENTER + Git RIGHT simultaneously
2. Writable file editor: Monaco editor with save-to-disk (Ctrl+S)
3. Terminal clipboard: xterm.js clipboard addon for copy/paste

---

## Phase 1: Setup

- [x] T001 Install `@xterm/addon-clipboard` package in frontend workspace

## Phase 2: Backend — File Save Endpoint

- [x] T002 Add `writeFile(basePath, filePath, content)` function to `backend/src/worker/file-reader.ts` using existing `resolveSafePath()` for security validation and `fs.writeFileSync()` for writing
- [x] T003 Add `PUT /api/sessions/:id/files/content` route to `backend/src/api/routes/files.ts` — accepts `{ path, content }` body, validates session exists, sanitizes path, calls `writeFile()`, returns `{ success: true }`
- [x] T004 Add backend test for file write endpoint in `backend/tests/integration/ide-panels.test.ts`

## Phase 3: Frontend — Terminal Clipboard

- [x] T005 [P] Load `ClipboardAddon` in `frontend/src/hooks/useTerminal.ts` — import from `@xterm/addon-clipboard`, instantiate and load after terminal creation. Add `allowProposedApi: true` to Terminal constructor options

## Phase 4: Frontend — Writable File Editor

- [x] T006 [P] Add `files.save(sessionId, filePath, content)` method to `frontend/src/services/api.ts` — PUT request to `/sessions/:id/files/content`
- [x] T007 Make FileViewer.tsx writable: (a) change `readOnly: true` to `readOnly: false`, (b) add `isModified` state tracking via Monaco `onChange`, (c) add `handleSave` that calls `files.save()` and clears `isModified`, (d) bind Ctrl+S via Monaco `addCommand`, (e) show modified dot indicator on tab when unsaved changes exist, (f) show brief "Saved" indicator after save

## Phase 5: Frontend — Dual-Panel Mode

- [x] T008 Refactor `frontend/src/hooks/usePanel.ts` for dual-panel state: replace single `activePanel` with `leftPanel: 'none' | 'files'` and `rightPanel: 'none' | 'git' | 'preview'`. Add `leftWidthPercent` (default 25) and `rightWidthPercent` (default 35). Update `openPanel()` to become `togglePanel()` that toggles the correct side. Keep `activePanel` as computed getter for backward compatibility. Update persistence save/load to handle new fields with backward-compatible fallback
- [x] T009 Update `frontend/src/components/SessionCard.tsx` for three-column layout: render `[Left Panel? | Drag Handle? | Terminal | Drag Handle? | Right Panel?]`. Terminal width = `100 - leftWidth - rightWidth` (only subtracting open panels). Two independent drag handles. Toolbar buttons toggle panels independently with independent active highlighting

## Phase 6: Polish

- [x] T010 Verify all tests pass (`npm test`) — 104 tests (92 backend + 12 frontend)
- [x] T011 Verify lint passes (`npm run lint`)
- [x] T012 Build and verify both workspaces (`npm run build`)
- [ ] T013 Commit, push, create PR, wait for CI, merge to main

---

## Dependencies

- T001 (install dep) → T005 (use addon)
- T002 (writeFile) → T003 (route) → T004 (test)
- T003 + T006 → T007 (FileViewer needs backend route and frontend API)
- T008 (usePanel refactor) → T009 (SessionCard uses new hook)
- T005, T007, T009 → T010-T013 (polish after all changes)

## Parallel Opportunities

- T002-T004 (backend) can run in parallel with T005 (clipboard, frontend)
- T006 (api.ts) can run in parallel with T005 (clipboard)
- T008 can start after T001, independent of backend work
