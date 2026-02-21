---
name: slides-add-slide
description: Add a new slide to the Slide Deck extension
---

# slides-add-slide

Adds a new slide to the Slide Deck extension panel. The slide content is provided as full HTML markup (it renders in an iframe at 16:9 aspect ratio). If a slide with the same name already exists, it will be overwritten.

## Usage

```bash
./scripts/slides-add-slide.sh <slide-name> <html-content> [speaker-notes]
```

## Parameters

- `slide-name` (required): A short identifier for the slide (e.g., "title", "agenda", "conclusion")
- `html-content` (required): Full HTML markup for the slide. Should be designed for 16:9 aspect ratio (~960x540). Can include inline styles and scripts.
- `speaker-notes` (optional): Plain text speaker notes for this slide

## Example

```bash
./scripts/slides-add-slide.sh "title" '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:white;font-family:sans-serif"><h1 style="font-size:48px">My Presentation</h1></div>' "Welcome everyone to the presentation"
```
