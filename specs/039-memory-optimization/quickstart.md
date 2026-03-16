# Quickstart: Memory Optimization

**Feature**: 039-memory-optimization | **Date**: 2026-03-16

## What This Feature Does

Fixes unbounded memory growth in the hub, preview proxy, and remote agent by closing cleanup gaps in session lifecycle handlers. Most cleanup code already exists — this adds the missing calls.

## Changes at a Glance

1. **Hub session cleanup** (hub-entry.ts): Delete widgetStore entries and clear cookieJar when sessions complete/fail
2. **Database cascade** (repository.ts): Extend deleteSession() to also delete comments, preview_comments, uploaded_images, video_recordings
3. **PTY scrollback cleanup** (pty-spawner.ts, remote-pty-bridge.ts): Add scrollbackWriters/scrollbackPending to cleanup()
4. **Debug endpoint** (new debug.ts route): GET /api/debug/memory returns resource counts

## How to Verify

1. Start the hub: `npm run dev`
2. Create a few sessions, use preview, run terminals
3. Complete/remove the sessions
4. Hit `GET /api/debug/memory` — resource counts should be near zero
5. Check `process.rss` — should be within 20% of startup baseline

## How to Test

```bash
cd backend
npm test -- --grep "cleanup\|cascade\|memory"
```

## Files Modified

| File | What Changed |
|------|-------------|
| `backend/src/hub-entry.ts` | +6 lines: widgetStore.delete + cookieJar.clear in session handlers |
| `backend/src/api/preview-proxy.ts` | +2 lines: export cookieJar |
| `backend/src/models/repository.ts` | +8 lines: cascade deletes in deleteSession() |
| `backend/src/worker/pty-spawner.ts` | +2 lines: scrollback cleanup in cleanup() |
| `backend/src/worker/remote-pty-bridge.ts` | +2 lines: scrollback cleanup in cleanup() |
| `backend/src/api/routes/debug.ts` | New file: ~30 lines debug endpoint |
