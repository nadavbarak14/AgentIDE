# postMessage Protocol Contract

**Feature**: 012-extension-system
**Date**: 2026-02-21

## Overview

Bidirectional communication between the host application (SessionCard) and extension iframes via `window.postMessage`. All messages are JSON objects with a `type` discriminator.

## Host → Extension Messages

### `init`

Sent once when the extension iframe signals `ready`. Provides session context.

```json
{
  "type": "init",
  "sessionId": "abc-123",
  "extensionName": "frontend-design"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"init"` | Yes | Message discriminator |
| sessionId | string | Yes | Current session ID |
| extensionName | string | Yes | Extension name from manifest |

---

### `board-command`

Forwarded when a board command matching the extension's `boardCommands` list is received via WebSocket.

```json
{
  "type": "board-command",
  "command": "design.add_screen",
  "params": {
    "name": "Homepage",
    "html": "<div class='p-4'><h1>Welcome</h1></div>"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"board-command"` | Yes | Message discriminator |
| command | string | Yes | Board command type |
| params | Record<string, string> | Yes | Command parameters |

---

## Extension → Host Messages

### `ready`

Sent by the extension when its UI has loaded and it is ready to receive messages.

```json
{
  "type": "ready"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"ready"` | Yes | Message discriminator |

---

### `board-command`

Extension requests the host to execute a board command (e.g., open a panel, show a file).

```json
{
  "type": "board-command",
  "command": "show_panel",
  "params": { "panel": "files" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"board-command"` | Yes | Message discriminator |
| command | string | Yes | Any valid board command type |
| params | Record<string, string> | Yes | Command parameters |

---

### `send-comment`

Extension requests the host to deliver a comment to the session. The host creates and delivers the comment via the existing comment API.

```json
{
  "type": "send-comment",
  "text": "Make this button larger and use the primary color",
  "context": {
    "source": "frontend-design",
    "screen": "Homepage",
    "element": "[button] \"Submit Order\" (role: button)"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"send-comment"` | Yes | Message discriminator |
| text | string | Yes | Comment text from the user |
| context | Record<string, string> | Yes | Structured context for the agent |
| context.source | string | Yes | Extension name |
| context.screen | string | No | Screen name (extension-specific) |
| context.element | string | No | Element description (extension-specific) |

**Delivered format** (what the agent sees):

```
[Design Review — Screen: "Homepage"] Element: [button] "Submit Order" (role: button)
Comment: Make this button larger and use the primary color.
```

---

## Security

- **Host validation**: On receiving a message, the host checks `event.source === iframeRef.current.contentWindow` before processing. Messages from unknown sources are ignored.
- **Extension validation**: Extensions should check `event.origin` matches the expected host origin. The host sends the origin in the `init` message implicitly (as the message origin).
- **Malformed messages**: Any message without a recognized `type` or with missing required fields is silently ignored. No error is thrown.

## Sequence Diagrams

### Extension Initialization

```
Extension iframe                    Host (SessionCard)
      |                                    |
      |  [iframe loads, JS executes]       |
      |                                    |
      | --- postMessage({ type: 'ready' }) -->
      |                                    |
      | <-- postMessage({ type: 'init',    |
      |       sessionId, extensionName }) --|
      |                                    |
      |  [extension ready for commands]    |
```

### Agent Skill → Extension UI Update

```
Agent         Skill Script       Backend (HTTP)     WebSocket        Host           Extension
  |                |                  |                 |              |                |
  | runs skill     |                  |                 |              |                |
  |--------------->|                  |                 |              |                |
  |                | POST /board-cmd  |                 |              |                |
  |                |----------------->|                 |              |                |
  |                |                  | broadcast WS    |              |                |
  |                |                  |---------------->|              |                |
  |                |                  |                 | onWsMessage  |                |
  |                |                  |                 |------------->|                |
  |                |                  |                 |              | postMessage    |
  |                |                  |                 |              |--------------->|
  |                |                  |                 |              |                | update UI
```

### User Comment → Agent

```
User        Extension iframe         Host (SessionCard)        Comment API        PTY
  |               |                        |                       |               |
  | click element |                        |                       |               |
  |-------------->|                        |                       |               |
  | type comment  |                        |                       |               |
  |-------------->|                        |                       |               |
  | click send    |                        |                       |               |
  |-------------->|                        |                       |               |
  |               | postMessage(send-comment)                      |               |
  |               |----------------------->|                       |               |
  |               |                        | POST /comments        |               |
  |               |                        |---------------------->|               |
  |               |                        | POST /comments/deliver|               |
  |               |                        |---------------------->|               |
  |               |                        |                       | write to PTY  |
  |               |                        |                       |-------------->|
  |               |                        |                       |               | agent reads
```
