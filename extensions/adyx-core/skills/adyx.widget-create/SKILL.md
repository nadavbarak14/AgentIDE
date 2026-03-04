---
name: adyx.widget-create
description: Show HTML/JS UI to the user in the canvas panel
---

# widget-create — Show UI to the User

Opens the canvas panel and displays your HTML/JS content to the user. Use this whenever you need to show something visual or collect input that plain text can't handle — color pickers, forms, confirmations, diagrams, etc.

There is only **one canvas**. Calling this again replaces whatever was showing before.

The `C3` bridge SDK is **automatically injected** — do NOT include any script tags for it. Just use `C3.sendResult(data)` in your HTML.

## Usage

```bash
./scripts/widget-create.sh <html-content> [--wait]
```

## Parameters

- `html-content` (required): The HTML markup to display. Can include inline styles and scripts. Max 512KB.
- `--wait` (optional): After showing the UI, block and wait for the user's response (up to 60s). Outputs the result JSON when received.

## How to Collect User Input

Use `C3.sendResult(data)` — it's always available:

```html
<button onclick="C3.sendResult({ chosen: 'red' })">Red</button>
<button onclick="C3.sendResult({ chosen: 'blue' })">Blue</button>
```

## Example — Show a Simple UI

```bash
./scripts/widget-create.sh '<div style="padding:20px;font-family:sans-serif"><h2>Pick a color</h2><button onclick="C3.sendResult({color:\"blue\"})">Blue</button> <button onclick="C3.sendResult({color:\"red\"})">Red</button></div>'
```

## Example — Show UI and Wait for Response

```bash
# Blocks until the user clicks, then outputs the result JSON
RESULT=$(./scripts/widget-create.sh '<div style="padding:20px;font-family:sans-serif"><p>Deploy to production?</p><button onclick="C3.sendResult({ok:true})">Yes</button> <button onclick="C3.sendResult({ok:false})">No</button></div>' --wait)
echo "$RESULT"  # e.g. {"ok":true}
```

## When to Use This

- You need the user to pick from visual options (colors, layouts, icons)
- You need a confirmation dialog with structured response
- You want to show a preview or diagram
- You need form input (multiple fields, sliders, toggles)
- Any time plain text input/output is insufficient

## Important

- **Always close the canvas** when you're done using `widget-dismiss.sh`
- The `--wait` flag is the easiest pattern: show → wait → get result → close
- If showing new content, the old content is automatically replaced
- The user can also dismiss the canvas using the trash icon in the panel header
