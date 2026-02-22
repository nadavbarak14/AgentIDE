---
name: widget-dismiss
description: Dismiss (remove) a widget from the user's panel
---

# widget-dismiss

Removes a named widget from the Widgets panel. Use this when a widget is no longer needed or to clean up after collecting results.

## Usage

```bash
./scripts/widget-dismiss.sh <widget-name>
```

## Parameters

- `widget-name` (required): The name of the widget to dismiss

## Example

```bash
./scripts/widget-dismiss.sh "color-picker"
```
