# Research: Localhost Direct Iframe Preview

**Feature**: 014-remote-preview-proxy (FR-015 — localhost direct iframe only)
**Date**: 2026-02-23

## Decision 1: Iframe Cross-Port Loading

**Decision**: An iframe from `localhost:3001` (hub) can load `localhost:3000` (dev server) directly. The page renders and is fully interactive. No CORS issues for iframe `src`.

**Rationale**: CORS applies to `fetch`/`XHR`/`<script>` requests, NOT to iframe navigation. The iframe loads the dev server page normally. The user can interact with forms, buttons, navigation — everything works. Cross-frame `contentDocument` access is blocked (different ports = different origins), but this only affects the inspect bridge, not page rendering or interaction.

**Alternatives considered**: None — standard browser behavior.

## Decision 2: Inspect Bridge in Direct Iframe Mode

**Decision**: The inspect bridge (element inspection, screenshots) will NOT be available in direct iframe mode. This is acceptable because: (a) localhost users have browser DevTools, (b) the proxy mode with full inspect bridge remains available by accessing the hub via a non-localhost address.

**Rationale**: Injecting the bridge script requires proxying and rewriting HTML. In direct iframe mode there's no proxy, so no injection point. The tradeoff is intentional — performance over inspect features for the localhost case.

**Alternatives considered**:
- Service worker injection: Overly complex, requires service worker registration on the dev server's origin
- `postMessage` bridge: Would require the dev server to include a script — not practical

## Decision 3: Localhost Detection Method

**Decision**: Use `window.location.hostname` to detect localhost access. Check for `'localhost'` and `'127.0.0.1'`.

**Rationale**: Immediate, synchronous, no API call needed. Reliable — the browser knows exactly what hostname was used to access the page.

**Alternatives considered**:
- Backend detection: Unnecessary round-trip; the frontend already knows
- Check all loopback addresses (::1, etc.): `::1` is IPv6 loopback but browsers typically resolve `localhost` to `127.0.0.1`; can add `::1` if needed

## Decision 4: Local Session Detection

**Decision**: Look up `session.workerId` in the `workers` array and check `worker.type === 'local'`. This data is already available in the component tree (SessionCard has both `session` and `workers` props).

**Rationale**: Follows existing codebase patterns (WorkerBadge, DirectoryPicker). No new data needed.

**Alternatives considered**: None — existing pattern.

## Decision 5: Address Bar Behavior

**Decision**: When using direct iframe, the address bar still shows `http://localhost:port/path`. Navigation updates are captured via the iframe's `onLoad` event. Since the iframe `src` is already a real `localhost` URL, the display URL extraction logic in LivePreview needs a minor update to handle non-proxy URLs (currently it only extracts from proxy URL patterns).

**Rationale**: The user should see the same URL format regardless of whether proxy is used or not.

**Alternatives considered**: None.

## Summary

All research questions resolved. No unknowns remain. The implementation is a small frontend-only change (~20 lines).
