---
name: design-update-screen
description: Update an existing screen design in the Frontend Design extension
---

# design-update-screen

Updates the HTML content of an existing screen in the Frontend Design extension. The screen must already exist (use `design-add-screen` to create new screens).

## Usage

```bash
./scripts/design-update-screen.sh <screen-name> <html-content>
```

## Parameters

- `screen-name` (required): The name of the screen to update
- `html-content` (required): The new HTML markup for the screen
