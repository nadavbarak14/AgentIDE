---
name: slides-update-slide
description: Update an existing slide in the Slide Deck extension
---

# slides-update-slide

Updates the HTML content and/or speaker notes of an existing slide. The slide must already exist (use `slides-add-slide` to create new slides).

## Usage

```bash
./scripts/slides-update-slide.sh <slide-name> <html-content> [speaker-notes]
```

## Parameters

- `slide-name` (required): The name of the slide to update
- `html-content` (required): The new HTML markup for the slide
- `speaker-notes` (optional): Updated speaker notes
