# Data Model: Memory Optimization

**Feature**: 039-memory-optimization | **Date**: 2026-03-16

## Overview

No new entities or tables are introduced. This feature modifies cleanup behavior for existing in-memory data structures and extends cascade deletion for existing database tables.

## In-Memory Data Structures (existing — cleanup added)

### widgetStore
- **Type**: `Map<string, Map<string, Widget>>`
- **Key**: sessionId → widgetName → Widget
- **Lifecycle**: Created when skill registers widget; **now deleted when session ends**
- **Location**: `hub-entry.ts`

### cookieJar (PreviewCookieJar.store_)
- **Type**: `Map<string, Map<string, string>>`
- **Key**: `${sessionId}:${port}` → cookieName → cookieValue
- **Lifecycle**: Created on proxied request with Set-Cookie; **now cleared when session ends**
- **Location**: `preview-proxy.ts`

### scrollbackWriters / scrollbackPending
- **Type**: `Map<string, ReturnType<typeof setTimeout>>` / `Map<string, string>`
- **Key**: sessionId
- **Lifecycle**: Created on terminal output; **now explicitly deleted in cleanup()**
- **Location**: `pty-spawner.ts`, `remote-pty-bridge.ts`

## Database Tables (existing — cascade delete added)

The following tables have a `session_id` column and are now cascade-deleted when `Repository.deleteSession()` is called:

| Table | Already Cascaded | Added in This Feature |
|-------|-----------------|----------------------|
| `panel_states` | Yes | — |
| `comments` | No | Yes |
| `preview_comments` | No | Yes |
| `uploaded_images` | No | Yes |
| `video_recordings` | No | Yes |

No schema changes. No new columns. No migrations.
