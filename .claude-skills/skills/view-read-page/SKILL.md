---
name: /view.read-page
description: Read the current page content as an accessibility tree showing interactive elements with roles, names, and states.
---

# View Read Page

Read the current page content from the preview browser as an accessibility tree. Shows interactive elements with their roles, names, and states. Use this before `/view.click` or `/view.type` to discover available elements.

## Usage

```bash
./scripts/view-read-page.sh
```

## Parameters

None.

## Examples

```bash
# Read the current page's accessibility tree
./scripts/view-read-page.sh
```
