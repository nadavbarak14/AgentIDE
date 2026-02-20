---
name: /view.navigate
description: Navigate the preview browser to a URL. Arguments: url (e.g., http://localhost:3000/login).
---

# View Navigate

Navigate the preview browser to a specified URL.

## Usage

```bash
./scripts/view-navigate.sh <url>
```

## Parameters

- `url` (required): The URL to navigate to in the preview browser

## Examples

```bash
# Navigate to a local dev server
./scripts/view-navigate.sh http://localhost:3000

# Navigate to a specific page
./scripts/view-navigate.sh http://localhost:3000/login
```
