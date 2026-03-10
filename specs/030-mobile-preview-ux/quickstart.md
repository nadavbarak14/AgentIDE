# Quickstart: Mobile Preview UX Redesign

## What This Feature Does

Removes all mobile-specific UI code and unifies the mobile experience with desktop. On phones, the app shows one full-screen session at a time with a compact session selector, keyboard-aware layout, waiting-session alerts, and edge-to-edge preview rendering.

## Prerequisites

- Node.js 20 LTS
- Branch: `030-mobile-preview-ux` (based on `029-mobile-secure-access`)
- `npm install` (no new dependencies)

## Development

```bash
# Start dev server
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Testing on Mobile

1. Start the dev server: `npm run dev`
2. Find your local IP: `hostname -I` or check Vite output
3. Open `http://<your-ip>:5173` on your phone (same network)
4. Or use Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M) → iPhone SE/12/14

## Key Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `frontend/src/components/SessionCard.tsx` | Modify | Remove `isMobileViewport` branch, add ClaudeActionBar, keyboard-aware chrome |
| `frontend/src/pages/Dashboard.tsx` | Modify | Remove headline, add mobile session selector, force `maxVisible=1` |
| `frontend/src/components/SessionGrid.tsx` | Modify | Full-height single card when `maxVisible=1` |
| `frontend/src/components/LivePreview.tsx` | Modify | Force desktop viewport mode on mobile |
| `frontend/src/components/SessionQueue.tsx` | Modify | Remove `isMobile` state and conditional sections |
| `frontend/src/hooks/useVisualViewport.ts` | New | Keyboard detection + `isMobile` flag |
| `frontend/src/hooks/useClaudeMode.ts` | New | Detect Claude Code mode from output patterns + needsInput |
| `frontend/src/components/ClaudeActionBar.tsx` | New | Contextual quick-actions: Accept/Reject/Stop/Tab/arrows |
| `frontend/src/components/MobileSessionSelector.tsx` | New | Compact session switcher for mobile |
| `frontend/src/components/WaitingSessionAlert.tsx` | New | Floating alert for waiting sessions |
| `frontend/src/components/ScrollToBottomButton.tsx` | New | Floating button when terminal scrolled up |
| `frontend/src/components/MobileSessionView.tsx` | Delete | Superseded |
| `frontend/src/components/MobileTerminalOutput.tsx` | Delete | Superseded |

## Implementation Order

1. **Create `useVisualViewport` hook** — foundation for all mobile behavior
2. **Create `useClaudeMode` hook** — detect permission/generating/input/idle modes
3. **Delete mobile components** — `MobileSessionView.tsx`, `MobileTerminalOutput.tsx`
4. **Clean SessionCard** — remove `isMobileViewport` branch and related state
5. **Create `ClaudeActionBar`** — contextual Accept/Reject/Stop/Tab/arrows bar
6. **Create `ScrollToBottomButton`** — floating button when scrolled up
7. **Modify Dashboard** — remove headline, add mobile detection, force `maxVisible=1`
8. **Create `MobileSessionSelector`** — compact session switcher
9. **Create `WaitingSessionAlert`** — floating alert pill
10. **Wire ClaudeActionBar into SessionCard** — pass sendInput, connect mode detection
11. **Modify LivePreview** — force desktop viewport on mobile
12. **Add keyboard-aware chrome collapse** — toolbar/header hide when keyboard open
13. **Clean SessionQueue** — remove `isMobile` special casing
14. **Write tests** — hook tests, component tests, integration tests

## Verification

- [ ] iPhone viewport (375px): single session fills screen, no scroll
- [ ] No "Adyx" headline visible
- [ ] No bottom tab bar
- [ ] Toolbar buttons all accessible (Files, Git, Preview, Shell, Search)
- [ ] Session selector shows and switches sessions
- [ ] Waiting session alert appears when background session needs input
- [ ] **Claude permission prompt → Accept/Reject buttons appear, 1-tap works**
- [ ] **Claude generating → Stop button appears, 1-tap sends Ctrl+C**
- [ ] **Claude waiting for input → Tab, ↑, ↓, Esc keys available**
- [ ] **Tab key sends tab character (triggers autocomplete)**
- [ ] **Scroll up in terminal → "Jump to bottom" button appears**
- [ ] Keyboard opens → chrome collapses, action bar sits above keyboard
- [ ] Keyboard closes → chrome restores
- [ ] Preview fills panel edge-to-edge, no device bezel
- [ ] Desktop layout unchanged
