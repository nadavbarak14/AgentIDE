---
name: widget-get-result
description: Poll for a widget's structured result from user interaction
---

# widget-get-result

Polls for the result of a named widget. Waits up to 60 seconds for the user to interact with the widget and submit a result.

## Usage

```bash
./scripts/widget-get-result.sh <widget-name>
```

## Parameters

- `widget-name` (required): The name of the widget to poll for results

## Behavior

- Polls every 0.5 seconds for up to 60 seconds
- When a result is ready, outputs the JSON result data
- If the timeout expires with no result, exits with an error

## Example

```bash
./scripts/widget-get-result.sh "color-picker"
# Output: {"color":"blue"}
```
