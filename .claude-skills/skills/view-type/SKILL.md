---
name: /view.type
description: Type text into an element. Arguments: role name text (e.g., textbox "Email" "user@test.com"). Use /view.read-page first.
---

# View Type

Type text into an element in the preview browser by its accessible role and name. Use `/view.read-page` first to discover available input elements.

## Usage

```bash
./scripts/view-type.sh <role> <name> <text>
```

## Parameters

- `role` (required): The accessible role of the element (e.g., textbox, combobox)
- `name` (required): The accessible name of the element (e.g., "Email", "Search")
- `text` (required): The text to type into the element

## Examples

```bash
# Type into an email field
./scripts/view-type.sh textbox "Email" "user@test.com"

# Type into a search box
./scripts/view-type.sh combobox "Search" "query text"

# Type into a password field
./scripts/view-type.sh textbox "Password" "secret123"
```
