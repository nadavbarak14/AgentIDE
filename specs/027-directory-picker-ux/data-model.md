# Data Model: Directory Picker UX Improvements

**Feature**: 027-directory-picker-ux
**Date**: 2026-03-06

## Overview

No new data entities or database changes. This feature is a frontend-only UI improvement. The data model documents the existing API response shapes used by the new browser UI.

## Existing Entities (unchanged)

### DirectoryEntry

Represents a single directory in a listing result.

| Field | Type   | Description                        |
|-------|--------|------------------------------------|
| name  | string | Directory name (e.g., "projects")  |
| path  | string | Full absolute path (e.g., "/home/ubuntu/projects") |

### DirectoryListResult

Response from the directory listing API.

| Field   | Type             | Description                              |
|---------|------------------|------------------------------------------|
| path    | string           | The resolved directory that was listed    |
| entries | DirectoryEntry[] | Subdirectories found (max 20)            |
| exists  | boolean          | Whether the requested path exists         |

### Project

Existing project entity used in ProjectPicker. No changes.

| Field         | Type    | Description                         |
|---------------|---------|-------------------------------------|
| id            | string  | Unique project identifier           |
| displayName   | string  | User-facing project name            |
| directoryPath | string  | Full path to the project directory  |
| workerId      | string  | Associated worker ID                |
| workerType    | string  | "local" or "remote"                 |
| workerName    | string  | Worker display name (for remote)    |
| workerStatus  | string  | "connected", "disconnected", "error"|
| bookmarked    | boolean | Whether the project is a favorite   |
| position      | number  | Sort position for bookmarked items  |

## Frontend Component State (new)

### DirectoryPicker Browser State

New state fields added to the DirectoryPicker component:

| State Field    | Type             | Default       | Description                                          |
|----------------|------------------|---------------|------------------------------------------------------|
| currentPath    | string           | home dir      | The directory currently being browsed                |
| browserEntries | DirectoryEntry[] | []            | Subdirectories of currentPath                        |
| browserLoading | boolean          | false         | Whether directory contents are being fetched         |
| browserError   | string \| null   | null          | Error message (e.g., "Cannot access directory")     |
| pathHistory    | string[]         | []            | Stack of visited paths for back navigation           |

## State Transitions

### Browser Navigation

```
Initial → (open browser) → Listing home dir
Listing → (click folder) → Listing subfolder (push to history)
Listing → (click back) → Listing parent (pop from history)
Listing → (click breadcrumb) → Listing target dir (truncate history)
Listing → (type path) → Listing typed path (reset history)
Listing → (click "Select") → Selected (close browser, set directory)
```

## Schema Changes

None. No database tables modified. No new API endpoints needed.
