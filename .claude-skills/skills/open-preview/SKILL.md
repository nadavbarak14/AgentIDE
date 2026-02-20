---
name: open-preview
description: Open the web preview panel in the C3 IDE and navigate to a URL. Use this when you want to show a web page or local dev server to the user.
---

# Open Preview in C3 IDE

Opens the Preview panel in the C3 dashboard and navigates to the specified URL.

## Usage

```bash
./scripts/open-preview.sh <url>
```

## Parameters

- `url` (required): The URL to navigate to in the preview panel

## Examples

```bash
# Open a local dev server
./scripts/open-preview.sh http://localhost:3000

# Open a specific page
./scripts/open-preview.sh http://localhost:5173/about
```
