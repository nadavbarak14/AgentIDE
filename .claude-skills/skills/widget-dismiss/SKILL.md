---
name: widget-dismiss
description: Close the canvas UI panel
---

# widget-dismiss — Close the Canvas

Closes the canvas panel, removing whatever HTML was being displayed. **Always call this when you're done** with the canvas to clean up.

## Usage

```bash
./scripts/widget-dismiss.sh
```

## When to Use

- After you've collected the user's input via `C3.sendResult()` and no longer need the UI
- When you want to clear the canvas before showing something else (though `widget-create.sh` auto-replaces)
- To clean up if the user's interaction is no longer needed

## Example

```bash
# Show UI, wait for result, then close
RESULT=$(./scripts/widget-create.sh '<button onclick="C3.sendResult({ok:true})">OK</button>' --wait)
./scripts/widget-dismiss.sh
echo "User said: $RESULT"
```
