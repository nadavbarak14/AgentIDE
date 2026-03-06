---
name: adyx.view-screenshot
description: "Capture a screenshot of the preview browser. Optional argument: mode ('viewport' for visible area only, 'full' for entire page; defaults to 'viewport'). Returns the file path of the saved PNG image."
---

# View Screenshot

Capture a screenshot of the preview browser and save it as a PNG image.

## Usage

```bash
./scripts/adyx.view-screenshot.sh [mode]
```

## Parameters

- `mode` (optional): `viewport` (default, visible area only) or `full` (scrolls to capture entire page)

## Examples

```bash
# Take a viewport screenshot (default)
./scripts/adyx.view-screenshot.sh

# Take a viewport screenshot (explicit)
./scripts/adyx.view-screenshot.sh viewport

# Take a full-page screenshot
./scripts/adyx.view-screenshot.sh full
```
