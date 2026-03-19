---
name: adyx.show-panel
description: Show a specific panel in the C3 IDE. Use this to toggle panels like files, git, or preview.
---

# Show Panel in C3 IDE

Opens the specified panel in the C3 dashboard.

## Usage

```bash
./adyx.show-panel/scripts/adyx.show-panel.sh <panel-name>
```

## Parameters

- `panel-name` (required): One of `files`, `git`, `preview`

## Examples

```bash
# Show the files panel
./adyx.show-panel/scripts/adyx.show-panel.sh files

# Show the git panel
./adyx.show-panel/scripts/adyx.show-panel.sh git

# Show the preview panel
./adyx.show-panel/scripts/adyx.show-panel.sh preview
```
