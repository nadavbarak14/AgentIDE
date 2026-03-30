# Data Model: Mobile Extensions & Projects Relocation

**Feature**: 044-mobile-extensions-projects
**Date**: 2026-03-29

## Overview

No database or schema changes. All state is managed in React component state within existing structures. This document captures the frontend state model changes.

## Entities (No Changes)

### MobilePanelName (existing — no modification)

```typescript
type MobilePanelName = 'none' | 'hamburger' | 'sessions' | 'preview' | 'files'
  | 'git' | 'shell' | 'settings' | 'issues' | 'widgets'
  | 'extensions' | 'extension' | 'projects' | 'project-detail';
```

All panel types already exist. No new panel types needed.

### Extension State in MobileLayout (existing — minor behavior change)

```typescript
// Existing state — no type changes
const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
const [activeExtensionName, setActiveExtensionName] = useState<string | null>(null);
```

**Behavior change**: `activePanel === 'extension'` now renders the `MobileExtensionTabs` component instead of directly rendering a single `ExtensionPanel`. The `activeExtensionName` state still tracks which extension is currently displayed.

## New Component Props

### MobileExtensionTabs

```typescript
interface MobileExtensionTabsProps {
  extensions: LoadedExtension[];         // All extensions with panels
  enabledExtensions: string[];           // Currently enabled extension names
  activeExtensionName: string | null;    // Currently selected tab
  sessionId: string;                     // Current session ID
  onSelectExtension: (name: string) => void;  // Tab selection callback
  onToggleExtension: (name: string) => void;  // Enable/disable extension
  onClose: () => void;                   // Close the panel
  extensionPanelRef: React.MutableRefObject<ExtensionPanelHandle | null>;
}
```

### MobileTopBar (modified props)

```typescript
interface MobileTopBarProps {
  // ... existing props unchanged ...
  sessionName: string;
  projectPath: string;
  isWaiting: boolean;
  waitingCount: number;
  sessionCount: number;
  onHamburgerTap: () => void;
  onSessionTap: () => void;
  onNewSession: () => void;
  // NEW
  onProjectsTap: () => void;            // Opens projects panel
  hasProjects?: boolean;                 // Whether to show projects icon
}
```

### MobileHamburgerMenu (modified items)

The `menuItems` array removes the `'projects'` entry. No prop changes needed — the `'projects'` panel type is simply removed from the static list.

## State Flow Diagrams

### Projects Access (New Flow)

```
MobileTopBar [projects icon tap]
  → onProjectsTap()
  → MobileLayout: open('projects')
  → MobileSheetOverlay renders project list
  → User taps project → open('project-detail')
  → User taps "Start Agent" → onStartAgent callback
```

### Extension Quick-Switch (New Flow)

```
MobileHamburgerMenu [Extensions tap]
  → handlePanelSelect('extensions')
  → MobileLayout: open('extensions')

  If no activeExtensionName:
    → Show extension list (current behavior)
    → User taps extension → setActiveExtensionName(name), open('extension')

  open('extension') panel now renders MobileExtensionTabs:
    → Tab bar: [ext1] [ext2] [⚙️]
    → Active tab shows ExtensionPanel iframe
    → Tap different tab → onSelectExtension(name)
      → setActiveExtensionName(newName)
      → ExtensionPanel remounts with new extension
    → Tap ⚙️ → open('extensions') (back to list for enable/disable)
```

### Preview Background Persistence (New Behavior)

```
Current (BEFORE):
  activePanel === 'preview'  → MobilePreviewSheet MOUNTED (iframe alive)
  activePanel === 'extension' → MobilePreviewSheet UNMOUNTED (iframe destroyed)
  activePanel === 'preview'  → MobilePreviewSheet MOUNTED (iframe reloads from scratch)

New (AFTER):
  currentSessionId && previewPort → MobilePreviewSheet ALWAYS MOUNTED
  activePanel === 'preview'       → MobilePreviewSheet visible (display: block)
  activePanel === 'extension'     → MobilePreviewSheet hidden (display: none, iframe alive)
  activePanel === 'preview'       → MobilePreviewSheet visible (no reload, state preserved)
```

### MobilePreviewSheet (modified props)

```typescript
interface MobilePreviewSheetProps {
  // ... existing props unchanged ...
  // NEW
  visible: boolean;  // Controls display: block/none instead of mount/unmount
}
```

## Relationships

```
MobileTopBar ──onProjectsTap──→ MobileLayout ──open('projects')──→ MobileSheetOverlay
                                                                      └── Project List
                                                                      └── Project Detail

MobileHamburgerMenu ──'extensions'──→ MobileLayout ──open('extensions')──→ Extension List
                                                    ──open('extension')──→ MobileExtensionTabs
                                                                              ├── Tab Bar (enabled extensions)
                                                                              └── ExtensionPanel (active tab)
```
