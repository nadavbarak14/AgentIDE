# Quickstart: Creating an Extension

**Feature**: 012-extension-system
**Date**: 2026-02-21

## Create your first extension in 5 steps

### 1. Create the extension folder

```bash
mkdir -p extensions/my-extension/ui
mkdir -p extensions/my-extension/skills/my-action/scripts
```

### 2. Write the manifest

Create `extensions/my-extension/manifest.json`:

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "panel": {
    "entry": "ui/index.html",
    "defaultPosition": "right",
    "icon": "puzzle"
  },
  "skills": ["skills/my-action"],
  "boardCommands": ["my-ext.update"]
}
```

### 3. Create the UI

Create `extensions/my-extension/ui/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 16px; margin: 0; background: #1e1e2e; color: #cdd6f4; }
    button { padding: 8px 16px; background: #89b4fa; color: #1e1e2e; border: none; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h2>My Extension</h2>
  <p id="status">Waiting for init...</p>
  <button onclick="sendComment()">Send Test Comment</button>

  <script>
    let sessionId = null;

    // Listen for messages from host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'init') {
        sessionId = msg.sessionId;
        document.getElementById('status').textContent = `Connected to session ${sessionId}`;
      }
      if (msg.type === 'board-command') {
        // Handle commands from agent skills
        console.log('Received command:', msg.command, msg.params);
      }
    });

    // Tell host we're ready
    window.parent.postMessage({ type: 'ready' }, '*');

    function sendComment() {
      window.parent.postMessage({
        type: 'send-comment',
        text: 'Hello from my extension!',
        context: { source: 'my-extension' }
      }, '*');
    }
  </script>
</body>
</html>
```

### 4. Create a skill (optional)

Create `extensions/my-extension/skills/my-action/SKILL.md`:

```markdown
---
name: my-action
description: Send an update to the My Extension panel
---

# My Action

Sends content to the My Extension panel.

## Usage

\`\`\`bash
./scripts/my-action.sh "Hello world"
\`\`\`
```

Create `extensions/my-extension/skills/my-action/scripts/my-action.sh`:

```bash
#!/bin/bash
CONTENT="$1"

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"my-ext.update\",\"params\":{\"content\":\"${CONTENT}\"}}" > /dev/null

echo "Sent update to My Extension"
```

Make it executable: `chmod +x extensions/my-extension/skills/my-action/scripts/my-action.sh`

### 5. Register skills and restart

```bash
npm run register-extensions   # Creates symlinks for skills
npm run dev                   # Start the dev server
```

Open the panel picker in any session — you'll see "My Extension" as an option.

## Manifest Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Unique ID, must match folder name, alphanumeric + hyphens |
| displayName | string | Yes | Label shown in panel picker |
| panel | object | No | Omit for skill-only extensions |
| panel.entry | string | Yes* | HTML file path relative to extension root |
| panel.defaultPosition | `"left"` \| `"right"` | Yes* | Preferred panel slot |
| panel.icon | string | Yes* | Icon name for panel picker |
| skills | string[] | No | Skill directory paths relative to extension root |
| boardCommands | string[] | No | Board command types routed to this extension's iframe |

## postMessage API

**Host → Extension**:
- `{ type: 'init', sessionId: string, extensionName: string }` — sent after extension signals ready
- `{ type: 'board-command', command: string, params: Record<string, string> }` — forwarded from agent skills

**Extension → Host**:
- `{ type: 'ready' }` — signal that extension UI is loaded
- `{ type: 'board-command', command: string, params: Record<string, string> }` — request host to execute a board command
- `{ type: 'send-comment', text: string, context: Record<string, string> }` — deliver a comment to the session
