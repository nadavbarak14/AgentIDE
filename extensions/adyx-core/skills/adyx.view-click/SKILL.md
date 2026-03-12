---
name: adyx.view-click
description: Click an element by accessible role and name. Arguments: role name (e.g., button "Sign In"). Use /view.read-page first to see available elements.
---

# View Click

Click an element in the preview browser by its accessible role and name. Use `/view.read-page` first to discover available interactive elements.

## Usage

```bash
./scripts/adyx.view-click.sh <role> <name>
```

## Parameters

- `role` (required): The accessible role of the element (e.g., button, link, checkbox)
- `name` (required): The accessible name of the element (e.g., "Sign In", "Submit")

## Examples

```bash
# Click a button
./scripts/adyx.view-click.sh button "Sign In"

# Click a link
./scripts/adyx.view-click.sh link "Home"

# Click a checkbox
./scripts/adyx.view-click.sh checkbox "Remember me"
```
