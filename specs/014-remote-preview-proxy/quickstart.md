# Quickstart: Localhost Direct Iframe Preview

**Feature**: 014-remote-preview-proxy (FR-015 — localhost direct iframe only)

## What Changed

When you access the AgentIDE hub via `localhost` and the session runs on a local worker, the preview panel now loads the dev server directly in the iframe — no proxy, no URL rewriting, no script injection. This eliminates all proxy overhead for the common local development case.

## How It Works

**Before (all previews proxied)**:
```
Browser → iframe "/api/sessions/:id/proxy/3000/" → Express proxy → localhost:3000
```

**After (localhost direct)**:
```
Browser → iframe "http://localhost:3000/" → localhost:3000 (direct)
```

The proxy is still used when accessing the hub via a remote IP or when the session runs on a remote worker.

## Testing

```bash
# Start a dev server on port 3000
cd your-project && npm run dev

# Access hub via localhost — preview uses direct iframe
open http://localhost:3001

# Access hub via IP — preview uses proxy (existing behavior)
open http://192.168.1.5:3001
```

## Notes

- Inspect bridge (element inspection, screenshots) is not available in direct iframe mode. Use browser DevTools instead.
- The proxy route (`/api/sessions/:id/proxy/:port/*`) is unchanged and still available for remote access.
