---
name: show-panel
description: Show a specific panel in the C3 IDE. Use this to toggle panels like files, git, or preview.
---

# Show Panel in C3 IDE

Opens the specified panel in the C3 dashboard.

## Usage

```bash
./scripts/show-panel.sh <panel-name>
```

## Parameters

- `panel-name` (required): One of `files`, `git`, `preview`

## Examples

```bash
# Show the files panel
./scripts/show-panel.sh files

# Show the git panel
./scripts/show-panel.sh git

# Show the preview panel
./scripts/show-panel.sh preview
```
