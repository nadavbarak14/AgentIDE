# Skills API Contract: Agent Work Report

## Skill: report.attach-screenshot

**Purpose**: Copy a screenshot to the report assets directory and return its relative path.

**Invocation**:
```bash
./report.attach-screenshot/scripts/report.attach-screenshot.sh <source-path>
```

**Parameters**:
- `source-path` (required): Absolute path to the screenshot file (PNG/JPG)

**Output** (stdout):
```
.report-assets/1710576000000-screenshot.png
```

**Errors** (stderr + exit 1):
- Source file does not exist
- Source file is not an image (invalid extension)

**Side effects**:
- Creates `.report-assets/` directory if it doesn't exist
- Copies file with timestamp prefix to `.report-assets/`

---

## Skill: report.attach-video

**Purpose**: Copy a video recording to the report assets directory and return its relative path.

**Invocation**:
```bash
./report.attach-video/scripts/report.attach-video.sh <source-path>
```

**Parameters**:
- `source-path` (required): Absolute path to the video file (WebM/MP4)

**Output** (stdout):
```
.report-assets/1710576000000-recording.webm
```

**Errors** (stderr + exit 1):
- Source file does not exist
- Source file is not a video (invalid extension)

**Side effects**:
- Creates `.report-assets/` directory if it doesn't exist
- Copies file with timestamp prefix to `.report-assets/`

---

## Skill: report.attach-diff

**Purpose**: Generate a git diff and return the diff text for embedding in the report.

**Invocation**:
```bash
./report.attach-diff/scripts/report.attach-diff.sh [git-diff-args...]
```

**Parameters**:
- `git-diff-args` (optional): Arguments passed to `git diff`. Defaults to `HEAD` (all uncommitted changes).
  - Examples: `HEAD~3`, `main...HEAD`, `-- src/file.ts`

**Output** (stdout):
```diff
diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,5 @@
...
```

**Errors** (stderr + exit 1):
- Not a git repository
- Invalid diff arguments

**Side effects**: None (read-only).

---

## Skill: report.export-github

**Purpose**: Convert the HTML report to GitHub-compatible markdown, upload media to GitHub, and output the PR body.

**Invocation**:
```bash
./report.export-github/scripts/report.export-github.sh [--repo owner/repo]
```

**Parameters**:
- `--repo` (optional): GitHub repository in `owner/repo` format. Defaults to the origin remote of the current git repo.

**Output** (stdout):
The markdown-formatted PR body with GitHub-hosted media URLs:
```markdown
## Work Report

Summary of changes...

### Screenshots

![Screenshot of new feature](https://github.com/user-attachments/assets/abc123...)

### Demo

https://github.com/user-attachments/assets/def456...

### Code Changes

```diff
...
```
```

**Errors** (stderr + exit 1):
- `report.html` does not exist
- `gh` CLI not authenticated
- GitHub API upload failure (with specific error)
- `ffmpeg` not available (warning only — skips video conversion)

**Side effects**:
- Uploads images to GitHub (creates user-content assets)
- Converts WebM to mp4 via ffmpeg (temporary file, cleaned up after upload)

---

## Board Command: report.file_changed

**Direction**: Host → Extension (via postMessage)

**Trigger**: FileWatcher detects `report.html` modified in session directory.

**Payload**:
```json
{
  "type": "board-command",
  "command": "report.file_changed",
  "params": {}
}
```

**Extension action**: Reload the report from the serve endpoint.
