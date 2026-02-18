# Implementation Plan: IDE Panels v4

**Branch**: `002-ide-panels` | **Date**: 2026-02-18 | **Spec**: `specs/002-ide-panels/spec.md`
**Input**: v4 clarifications — dual-panel mode, writable files, terminal clipboard

## Summary

Three changes to the IDE panels feature:
1. **Dual-panel mode**: Support showing Files (LEFT) and Git (RIGHT) panels simultaneously in a three-column layout
2. **Writable file editor**: Change Monaco from read-only to editable with save-to-disk support (Ctrl+S)
3. **Terminal clipboard**: Enable copy/paste in xterm.js terminal via clipboard addon

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: React 18, Monaco Editor, xterm.js 5, Express 4, better-sqlite3
**Storage**: SQLite (existing panel_states table)
**Testing**: Vitest 2.1
**Target Platform**: Web browser (Chrome, Firefox, Safari)
**Project Type**: Web application (backend + frontend workspaces)

## Constitution Check

- **I. Testing**: All changes will have tests
- **II. UX-First**: Dual-panel and writable files improve UX
- **III. UI Consistency**: Three-column layout follows IDE conventions
- **IV. Simplicity**: Minimal changes to existing code
- **V. CI/CD**: PR workflow with rebase merge
- **VI. Frontend Plugins**: Using established xterm.js addon
- **VII. Backend Security**: File write uses existing path sanitization
- **VIII. Observability**: File save operations logged

All gates pass.

## Project Structure

```text
backend/
├── src/
│   ├── api/routes/files.ts          # ADD: PUT endpoint for file save
│   └── worker/file-reader.ts        # ADD: writeFile() function
└── tests/

frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx          # MODIFY: three-column layout with dual panels
│   │   └── FileViewer.tsx           # MODIFY: writable editor + save
│   ├── hooks/
│   │   ├── usePanel.ts              # MODIFY: dual-panel state (leftPanel + rightPanel)
│   │   └── useTerminal.ts           # MODIFY: clipboard addon
│   └── services/
│       └── api.ts                   # ADD: files.save() method
└── tests/
```

## Code Changes

### Change 1: Dual-Panel Mode (Files + Git simultaneously)

**Files modified**: `usePanel.ts`, `SessionCard.tsx`, `api.ts` (panel state type)

**usePanel.ts changes**:
- Replace single `activePanel` state with `leftPanel: 'none' | 'files'` and `rightPanel: 'none' | 'git' | 'preview'`
- Replace `openPanel()` with `togglePanel()` that toggles the appropriate side
- Add `leftWidthPercent` (default 25%) and `rightWidthPercent` (default 35%) as separate width states
- Keep backward-compatible persistence: save both `leftPanel` and `rightPanel` to panel_states. When loading old data that only has `activePanel`, map it to the appropriate side
- Computed `activePanel` getter for backward compatibility

**SessionCard.tsx changes**:
- Three-column flex layout: `[Left Panel? | Drag Handle? | Terminal | Drag Handle? | Right Panel?]`
- Terminal width = `100% - leftWidth - rightWidth` (only subtracting panels that are open)
- Two independent drag handles with separate resize logic
- Toolbar buttons toggle panels independently (click "Files" toggles left panel, click "Git" toggles right panel)
- Active button highlighting: each button highlighted independently based on its panel state

**Panel state persistence**:
- Update `PanelStateData` interface to add `leftPanel` and `rightPanel` fields
- Backend schema unchanged (JSON column stores whatever fields we send)
- Backward compatibility: if loaded state has `activePanel` but no `leftPanel`/`rightPanel`, map it

### Change 2: Writable File Editor

**Files modified**: `FileViewer.tsx`, `api.ts`, `files.ts` (backend route), `file-reader.ts`

**Backend**:
- Add `writeFile(basePath, filePath, content)` to `file-reader.ts` — uses same `resolveSafePath()` for security, writes content via `fs.writeFileSync()`
- Add `PUT /api/sessions/:id/files/content` route in `files.ts` — validates session, sanitizes path, calls `writeFile()`

**Frontend API**:
- Add `files.save(sessionId, filePath, content)` method

**FileViewer.tsx**:
- Change `readOnly: true` to `readOnly: false`
- Track `isModified` state — set true when Monaco `onChange` fires and content differs from last loaded
- Add `handleSave` callback: calls `files.save()`, updates `prevContentRef`, clears `isModified`
- Add Ctrl+S handler via Monaco's `addCommand` (intercepts before browser default)
- Show modified indicator: dot or bullet on the tab when `isModified` is true
- Show brief "Saved" toast/indicator after successful save

### Change 3: Terminal Clipboard Support

**Files modified**: `useTerminal.ts`, `package.json` (new dependency)

- Install `@xterm/addon-clipboard`
- Import and load `ClipboardAddon` in `useTerminal.ts` after terminal creation
- The addon automatically handles:
  - Ctrl+C: copy selected text (or send SIGINT if no selection)
  - Ctrl+V: paste from clipboard
  - Right-click: context menu with copy/paste options
