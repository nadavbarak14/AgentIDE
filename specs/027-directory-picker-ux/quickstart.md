# Quickstart: Directory Picker UX Improvements

**Feature**: 027-directory-picker-ux
**Date**: 2026-03-06

## What Changed

The directory selection experience when creating a new session has been redesigned:

1. **Visual Directory Browser** — Instead of typing paths into a text input with autocomplete, users can now click through folders visually. The browser shows a list of subdirectories, breadcrumb navigation, a back button, and a "Select this folder" button.

2. **Synced Path Bar** — A text input at the top of the browser stays synced with the visual navigation. Power users can type/paste paths directly; the browser updates to match.

3. **Better Path Display** — Project rows show smarter path abbreviations using `~` prefix and preserving more path segments. Full paths available via tooltip.

4. **Prominent Browse Button** — The "Browse" button is now at the top of the project picker (above the project list) with a folder icon and solid border.

5. **Larger Project List** — Max height increased from 160px to 240px, showing ~6 projects without scrolling.

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/DirectoryPicker.tsx` | Added visual folder browser with clickable navigation, breadcrumbs, back button, select button |
| `frontend/src/components/ProjectPicker.tsx` | Moved browse button to top, improved path display, increased list height, better clear button |
| `frontend/tests/components/DirectoryPicker.test.tsx` | New — tests for browser navigation, breadcrumbs, select, back |
| `frontend/tests/components/ProjectPicker.test.tsx` | New — tests for path display, browse button, list height |

## How to Test

```bash
# Run frontend tests
cd frontend && npx vitest run

# Run specific test files
cd frontend && npx vitest run tests/components/DirectoryPicker.test.tsx
cd frontend && npx vitest run tests/components/ProjectPicker.test.tsx
```

## Manual Verification

1. Start the app and go to the session queue sidebar
2. Click "Browse" — should open a visual folder browser starting at home directory
3. Click a folder — should navigate into it, breadcrumbs update
4. Click back — should go to parent
5. Click a breadcrumb segment — should jump to that location
6. Type a path in the path bar — should update the browser
7. Click "Select this folder" — should set the directory and close the browser
8. Verify project rows show readable paths with `~` abbreviation
9. Verify the browse button is at the top with a folder icon
