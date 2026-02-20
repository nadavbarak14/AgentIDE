---
name: /view.set-resolution
description: Set the preview browser viewport to a custom resolution. Arguments: width height (in pixels, e.g., 768 1024).
---

# View Set Resolution

Set the preview browser viewport to a custom resolution.

## Usage

```bash
./scripts/view-set-resolution.sh <width> <height>
```

## Parameters

- `width` (required): Viewport width in pixels
- `height` (required): Viewport height in pixels

## Examples

```bash
# Set to tablet portrait
./scripts/view-set-resolution.sh 768 1024

# Set to mobile
./scripts/view-set-resolution.sh 375 667

# Set to desktop
./scripts/view-set-resolution.sh 1920 1080
```
