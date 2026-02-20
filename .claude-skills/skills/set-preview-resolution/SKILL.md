---
name: set-preview-resolution
description: Set the preview browser to a custom resolution (width x height). Use this when you need to test a specific viewport size.
---

# Set Preview Resolution in C3 IDE

Sets the preview panel's viewport to a custom width and height in pixels.

## Usage

```bash
./scripts/set-preview-resolution.sh <width> <height>
```

## Parameters

- `width` (required): Viewport width in pixels (100-4096)
- `height` (required): Viewport height in pixels (100-4096)

## Examples

```bash
# Set to tablet landscape
./scripts/set-preview-resolution.sh 1024 768

# Set to iPad portrait
./scripts/set-preview-resolution.sh 768 1024

# Set to 4K
./scripts/set-preview-resolution.sh 3840 2160
```
