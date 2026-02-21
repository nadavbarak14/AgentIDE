---
name: design-add-screen
description: Add a new screen design to the Frontend Design extension
---

# design-add-screen

Adds a new named screen to the Frontend Design extension panel. The screen content is provided as HTML markup. If a screen with the same name already exists, it will be overwritten.

## Usage

```bash
./scripts/design-add-screen.sh <screen-name> <html-content>
```

## Parameters

- `screen-name` (required): A short identifier for the screen (e.g., "homepage", "login", "dashboard")
- `html-content` (required): The HTML markup for the screen design. Can include inline styles and scripts.

## Example

```bash
./scripts/design-add-screen.sh "homepage" '<div style="padding:20px"><h1>Welcome</h1><button>Get Started</button></div>'
```
