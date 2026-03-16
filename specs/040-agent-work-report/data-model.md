# Data Model: Agent Work Report

## Overview

No database tables needed. All data lives on the filesystem, scoped to the session's working directory.

## Entities

### Report File

- **Location**: `<session.workingDirectory>/report.html`
- **Type**: Single HTML file, fully controlled by the agent
- **Lifecycle**: Created by agent, deleted on session cleanup
- **Constraints**: Any valid HTML accepted. Must use relative paths for media references.

### Report Assets Directory

- **Location**: `<session.workingDirectory>/.report-assets/`
- **Type**: Directory containing media files
- **Lifecycle**: Created on first attachment, deleted on session cleanup
- **Contents**:
  - Screenshots: `*.png`, `*.jpg`
  - Videos: `*.webm`, `*.mp4`
  - Any other files the agent copies via attachment skills

### File Naming Convention

Attached files are named with a timestamp prefix for uniqueness:

```
.report-assets/
├── 1710576000000-screenshot.png
├── 1710576030000-demo-recording.webm
└── 1710576060000-another-shot.png
```

## State Transitions

```
No report → Agent creates report.html → Report visible in extension panel
                                       → Agent updates report.html → Panel refreshes
                                       → Session ends → report.html + .report-assets/ deleted
```

## Relationships

- **Session → Report**: One-to-one. One session, one report file.
- **Report → Assets**: One-to-many. Report HTML references zero or more files in `.report-assets/`.
- **Report → GitHub PR**: One-to-one export. Report converts to markdown + uploaded media for one PR.
