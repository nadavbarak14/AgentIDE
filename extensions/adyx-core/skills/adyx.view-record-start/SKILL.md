---
name: adyx.view-record-start
description: Start recording the preview browser as a WebM video. Optional argument: mode ("full" for full page, "viewport" for visible area only; defaults to "full"). Use /view.record-stop to stop and get the file path.
---

# View Record Start

Start recording the preview browser as a WebM video. Use `/view.record-stop` to stop recording and retrieve the saved file path.

## Usage

```bash
./scripts/adyx.view-record-start.sh [mode]
```

## Parameters

- `mode` (optional): Recording mode - "full" (default, captures full page) or "viewport" (visible area only)

## Examples

```bash
# Start recording full page (default)
./scripts/adyx.view-record-start.sh

# Start recording viewport only
./scripts/adyx.view-record-start.sh viewport

# ... interact with the preview ...

# Stop recording and get the file path
# Use /view.record-stop
```
