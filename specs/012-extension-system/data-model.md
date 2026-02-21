# Data Model: Extension System

**Feature**: 012-extension-system
**Date**: 2026-02-21

## Overview

No database changes. All extension state is held in React component state (frontend) and filesystem (extension files). This document describes the TypeScript interfaces and data structures used at runtime.

## Entities

### ExtensionManifest

The JSON manifest file declaring an extension's capabilities.

```typescript
interface ExtensionManifest {
  /** Unique extension identifier (matches folder name) */
  name: string;
  /** Human-readable name for the panel picker */
  displayName: string;
  /** Optional panel configuration (omit for skill-only extensions) */
  panel?: {
    /** Path to HTML entry point, relative to extension root */
    entry: string;
    /** Preferred panel slot */
    defaultPosition: 'left' | 'right';
    /** Icon name for panel picker (matches existing icon set) */
    icon: string;
  };
  /** Skill directories relative to extension root */
  skills?: string[];
  /** Board command types this extension handles (routed to iframe) */
  boardCommands?: string[];
}
```

**Validation rules**:
- `name` must match the folder name
- `name` must be alphanumeric + hyphens only
- `displayName` is required and non-empty
- If `panel` is present, `panel.entry` must point to an existing file
- `skills` paths must point to directories containing `SKILL.md`
- `boardCommands` must be non-empty strings

**Example** (`extensions/frontend-design/manifest.json`):
```json
{
  "name": "frontend-design",
  "displayName": "Frontend Design",
  "panel": {
    "entry": "ui/index.html",
    "defaultPosition": "right",
    "icon": "layout"
  },
  "skills": [
    "skills/design-add-screen",
    "skills/design-update-screen",
    "skills/design-remove-screen"
  ],
  "boardCommands": [
    "design.add_screen",
    "design.update_screen",
    "design.remove_screen"
  ]
}
```

---

### LoadedExtension

Runtime representation of a discovered and validated extension.

```typescript
interface LoadedExtension {
  /** Extension name from manifest */
  name: string;
  /** Display name from manifest */
  displayName: string;
  /** Resolved URL to the extension's HTML entry point (or null for skill-only) */
  panelUrl: string | null;
  /** Panel configuration from manifest */
  panelConfig: {
    defaultPosition: 'left' | 'right';
    icon: string;
  } | null;
  /** Board command types this extension handles */
  boardCommands: string[];
  /** Panel content key used in the panel system: `ext:<name>` */
  panelKey: string;
}
```

---

### PostMessagePayload

Messages exchanged between host and extension iframe.

```typescript
/** Host → Extension */
type HostToExtensionMessage =
  | { type: 'init'; sessionId: string; extensionName: string }
  | { type: 'board-command'; command: string; params: Record<string, string> };

/** Extension → Host */
type ExtensionToHostMessage =
  | { type: 'ready' }
  | { type: 'board-command'; command: string; params: Record<string, string> }
  | { type: 'send-comment'; text: string; context: Record<string, string> };
```

---

### DesignScreen (Frontend Design extension — internal state)

```typescript
interface DesignScreen {
  /** Unique screen name */
  name: string;
  /** Raw HTML content to render */
  html: string;
  /** Timestamp of last update */
  updatedAt: number;
  /** Comments on this screen */
  comments: ElementComment[];
}
```

---

### ElementComment (Frontend Design extension — internal state)

```typescript
interface ElementComment {
  /** Unique comment ID */
  id: string;
  /** CSS selector or description of the target element */
  elementSelector: string;
  /** Human-readable description: [tagName] "text" (role: ...) */
  elementDescription: string;
  /** Bounding rect at time of comment (for pin placement) */
  rect: { x: number; y: number; width: number; height: number };
  /** Comment text */
  text: string;
  /** Whether the element still exists in the current HTML */
  stale: boolean;
  /** Timestamp */
  createdAt: number;
}
```

## State Transitions

### Extension Lifecycle

```
[not present] → discovered (manifest found) → validated (manifest parsed successfully) → loaded (panel URL resolved, skills registered)
                                             → skipped (invalid manifest — logged, ignored)
```

### Screen Lifecycle (Frontend Design)

```
[empty] → added (via design.add_screen) → updated (via design.update_screen) → removed (via design.remove_screen)
```

### Comment Lifecycle (Frontend Design)

```
[none] → created (user clicks element + types comment) → delivered (sent to session via host) → [deleted from local state]
                                                        → stale (element no longer exists after screen update)
```

## Relationships

```
Extension 1──* Skill (file-based, via symlinks)
Extension 1──1 Panel (optional, iframe-based)
Extension 1──* BoardCommand (types it handles)

Panel 1──* Screen (Frontend Design only)
Screen 1──* ElementComment
```
