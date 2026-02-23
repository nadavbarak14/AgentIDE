# Data Model: Localhost Direct Iframe Preview

**Feature**: 014-remote-preview-proxy (FR-015 — localhost direct iframe only)
**Date**: 2026-02-23

## Schema Changes

None. No database changes needed for this feature.

## Type Changes

None. No new types or interface modifications needed. The existing `Worker.type: 'local' | 'remote'` already provides the data needed for detection.

## Runtime State

No new runtime state. The `isLocalDirect` flag is computed on-the-fly in the React component from existing data:

```typescript
const isLocalDirect = isLocalSession &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
```

Where `isLocalSession` is derived from:
```typescript
const worker = workers.find(w => w.id === session.workerId);
const isLocalSession = !worker || worker.type === 'local';
```
