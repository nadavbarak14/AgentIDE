---
name: open-file
description: Open a file in the C3 IDE file viewer panel. Use this when you want to show a specific file to the user in the editor.
---

# Open File in C3 IDE

Opens the specified file in the C3 dashboard file viewer panel.

## Usage

```bash
./scripts/open-file.sh <file-path> [line-number]
```

## Parameters

- `file-path` (required): Relative path to the file to open
- `line-number` (optional): Line number to scroll to

## Examples

```bash
# Open a file
./scripts/open-file.sh src/index.ts

# Open a file at a specific line
./scripts/open-file.sh src/components/App.tsx 42
```
