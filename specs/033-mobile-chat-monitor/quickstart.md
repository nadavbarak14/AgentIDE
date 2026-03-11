# Quickstart: Mobile Chat Monitor UX

## Prerequisites

- Node.js 20 LTS
- npm

## Setup

```bash
git checkout 033-mobile-chat-monitor
npm install
npm run build
```

## Running

```bash
# Start the app on port 3007 for testing (keep port 3006 for the dev IDE)
PORT=3007 node backend/dist/hub-entry.js --password test
```

## Testing Mobile UX

1. Open `http://localhost:3007/?key=test` in Chrome
2. Open DevTools → Toggle Device Toolbar (Ctrl+Shift+M)
3. Select iPhone 16 (390×844) or any phone preset
4. Verify: Claude terminal fills the screen with only top bar + action bar

### Key Flows to Test

- **Terminal view**: Full-screen terminal, no split panels
- **Action bar**: Tab, ↑, ↓, Esc, Enter, Stop, ⇧⇧ all functional
- **Hamburger menu**: Tap ☰ → see Files, Git, Preview, Shell, Settings
- **Panel overlays**: Each panel opens as full-screen sheet, close returns to terminal
- **Preview**: Opens edge-to-edge with only URL bar + close button
- **Approval cards**: Trigger a tool approval → see overlay card with Accept/Reject
- **Session switching**: Tap session name → full-screen list → tap to switch
- **Desktop**: Resize to >768px → desktop layout unchanged

## Running Tests

```bash
npm test
npm run lint
```

## Design Reference

- Interactive mockups: `specs/033-mobile-chat-monitor/designs/mockup-comparison.html`
- UX testing screenshots: `specs/033-mobile-chat-monitor/designs/screenshots/`
- Selected design: **Design A — Chat Monitor**
