---
name: adyx.widget-get-result
description: Wait for the user's response from the canvas UI
---

# widget-get-result — Get User's Response

Waits for the user to interact with the canvas and submit a result. Polls for up to 60 seconds.

Usually you don't need this directly — use `widget-create.sh ... --wait` instead, which shows the UI and waits in one step.

Use this only if you showed the canvas separately and need to check for results later.

## Usage

```bash
./scripts/widget-get-result.sh
```

## Behavior

- Polls every 1 second for up to 60 seconds
- When the user submits a result (via `C3.sendResult(data)`), outputs the JSON data
- If the timeout expires with no result, exits with an error

## Example

```bash
# Show a UI first
./scripts/widget-create.sh '<button onclick="C3.sendResult({ok:true})">Confirm</button>'

# Then wait for the result separately
RESULT=$(./scripts/widget-get-result.sh)
echo "$RESULT"  # e.g. {"ok":true}
```

## Tip

Prefer `widget-create.sh --wait` for the common show-then-wait pattern. Use `widget-get-result.sh` only when you need to do something between showing the UI and collecting the result.
