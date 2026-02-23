# Implementation Plan: Localhost Direct Iframe Preview

**Branch**: `014-remote-preview-proxy` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-remote-preview-proxy/spec.md`
**Scope**: FR-015 only — localhost direct iframe. All remote agent work deferred.

## Summary

When the hub is accessed via localhost and the session runs on a local worker, the preview panel uses a direct iframe pointing at `localhost:<port>` with no proxy, URL rewriting, or script injection. This eliminates the performance overhead of the reverse proxy (HTML rewriting, fetch interception, DOM patching, gzip compression) for the common local development case. The full proxy remains active when the hub is accessed remotely or when the session runs on a remote worker.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, Vite 6, Tailwind CSS 3
**Storage**: N/A — no schema changes
**Testing**: Vitest 2.1.0, @testing-library/react, supertest
**Target Platform**: Linux server, browser (Chrome/Firefox)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Zero proxy overhead for localhost previews — iframe loads directly from dev server
**Constraints**: Must not break existing proxy for remote access
**Scale/Scope**: 2 files modified (frontend), 0 backend changes needed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for `toProxyUrl()` with new logic; system test for direct iframe |
| II. UX-First Design | PASS | Direct iframe eliminates proxy lag — better UX for localhost users |
| III. UI Quality & Consistency | PASS | No visual changes — same iframe, just different `src` |
| IV. Simplicity | PASS | Removes complexity (proxy) for the common case; ~10 lines changed |
| V. CI/CD Pipeline | PASS | Standard branch workflow |
| VI. Frontend Plugin Quality | PASS | No new dependencies |
| VII. Backend Security | PASS | No backend changes; direct iframe only for localhost access |
| VIII. Observability | PASS | No new logging needed — removing proxy means less to observe |

All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/014-remote-preview-proxy/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A — no data model changes)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A — no API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── LivePreview.tsx        # MODIFY: toProxyUrl() — bypass proxy for localhost
│   │   └── SessionCard.tsx        # MODIFY: pass isLocalSession prop to LivePreview
│   └── services/
│       └── api.ts                 # READ ONLY: Worker type definitions
└── tests/                         # ADD: unit test for toProxyUrl

backend/
├── src/
│   └── api/
│       └── routes/files.ts        # NO CHANGES — proxy route stays as-is
└── tests/                         # ADD: system test for direct iframe behavior
```

**Structure Decision**: Web application structure (existing). Only frontend changes needed — the backend proxy route is untouched.

## Design

### Current Flow (all previews proxied)

```
Browser → iframe src="/api/sessions/:id/proxy/:port/" → Express proxy → localhost:port
```

Every request goes through the proxy which: strips headers, rewrites HTML, injects scripts, handles cookies, compresses responses. This adds latency and CPU overhead.

### New Flow (localhost direct iframe)

```
Browser → iframe src="http://localhost:port/" → localhost:port (direct)
```

When conditions are met (localhost hub + local session), the iframe points directly at the dev server. No proxy, no rewriting, no overhead.

### Detection Logic

Two conditions must BOTH be true for direct iframe:

1. **Hub accessed via localhost**: `window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'`
2. **Session is on a local worker**: Worker lookup via `session.workerId` → `worker.type === 'local'`

If either is false, use the existing proxy.

### Implementation Detail

**`LivePreview.tsx` — `toProxyUrl()` modification:**

Current signature: `toProxyUrl(sessionId: string, displayUrl: string): string`

New signature: `toProxyUrl(sessionId: string, displayUrl: string, isLocalDirect: boolean): string`

When `isLocalDirect` is true AND the URL matches `localhost:port`, return the original URL unchanged (e.g., `http://localhost:3000/`) instead of converting to `/api/sessions/:id/proxy/3000/`.

**`SessionCard.tsx` — prop threading:**

SessionCard already has access to both `session` and `workers`. Compute `isLocalSession` by looking up `session.workerId` in `workers` and checking `worker.type === 'local'`. Pass this as a prop to LivePreview.

**`LivePreview.tsx` — `isLocalDirect` computation:**

```typescript
const isLocalDirect = isLocalSession &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
```

### What Stays the Same

- Backend proxy route (`/api/sessions/:id/proxy/:port/*`) — unchanged, still works for remote access
- External URL proxy (`/api/sessions/:id/proxy-url/:encodedUrl`) — unchanged
- File serving route (`/api/sessions/:id/serve/`) — unchanged
- All proxy utilities (HTML rewriting, cookie handling, bridge script) — unchanged
- Address bar display logic — still shows `http://localhost:port/path`

### Edge Cases

- **Switching from remote to local hub access**: If user bookmarks a session URL on public IP, then accesses via localhost later, the preview will switch to direct iframe automatically. No state issues since iframe is stateless.
- **Dev server with CORS restrictions**: Direct iframe from `localhost:3001` (hub) to `localhost:3000` (dev server) — same origin policy allows this for iframes. CORS only matters for `fetch`/XHR. The iframe will load fine.
- **Dev server binding to 0.0.0.0**: Still accessible via `localhost`, so direct iframe works.
- **Inspect bridge**: The inspect bridge script will NOT be injected in direct iframe mode. This is acceptable since html2canvas and the inspect overlay work from the parent frame (LivePreview component), not from inside the iframe. Cross-origin iframe access is possible since both are on localhost (same origin for iframe communication).

## Complexity Tracking

No violations — no complexity tracking needed.
