---
name: widget-create
description: Create an interactive HTML widget displayed to the user
---

# widget-create

Creates a named interactive widget in the Widgets panel. The widget content is provided as HTML markup and rendered in a sandboxed iframe. If a widget with the same name already exists, it will be replaced (and any previous result cleared).

The C3 bridge SDK (`C3.sendResult`, `C3.ready`, etc.) is **automatically injected** — do NOT include `<script src="/api/widget-bridge.js">`.

## Usage

```bash
./scripts/widget-create.sh <widget-name> <html-content> [--wait]
```

## Parameters

- `widget-name` (required): A lowercase identifier using only letters, numbers, and hyphens (e.g., "color-picker", "feedback-form")
- `html-content` (required): The HTML markup for the widget. Can include inline styles and scripts. Max 512KB.
- `--wait` (optional): After creating the widget, poll for the user's result (up to 60s). Outputs the result JSON when received.

## Sending Results Back

The `C3` global is always available — just call `C3.sendResult(data)`:

```html
<button onclick="C3.sendResult({ chosen: 'red' })">Red</button>
```

Or use raw postMessage if preferred:

```html
<script>
  window.parent.postMessage({ type: 'widget-result', data: { chosen: 'red' } }, '*');
</script>
```

## Example

```bash
./scripts/widget-create.sh "color-picker" '<div style="padding:20px"><h2>Pick a color</h2><button onclick="C3.sendResult({color:\"blue\"})">Blue</button></div>'
```

## Example with --wait

```bash
# Creates the widget and blocks until the user clicks, then outputs the result JSON
./scripts/widget-create.sh "confirm" '<div style="padding:20px;font-family:sans-serif"><p>Are you sure?</p><button onclick="C3.sendResult({ok:true})">Yes</button> <button onclick="C3.sendResult({ok:false})">No</button></div>' --wait
```
