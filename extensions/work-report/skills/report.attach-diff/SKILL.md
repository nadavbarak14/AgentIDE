---
name: report.attach-diff
description: "Generate a git diff and output it to stdout for embedding in the work report HTML."
---

# Attach Diff to Work Report

Runs `git diff` with the provided arguments and outputs the diff text to stdout. Use the output to embed code changes in your HTML work report.

## Usage

```bash
./report.attach-diff/scripts/report.attach-diff.sh [git-diff-args...]
```

## Parameters

- `git-diff-args` (optional): Arguments passed to `git diff`. Defaults to `HEAD` (all uncommitted changes).
  - Examples: `HEAD~3`, `main...HEAD`, `-- src/file.ts`

## Output

Raw unified diff text to stdout.

## Example

```bash
# Get all uncommitted changes
DIFF=$(./report.attach-diff/scripts/report.attach-diff.sh)

# Get changes from last 3 commits
DIFF=$(./report.attach-diff/scripts/report.attach-diff.sh HEAD~3)

# Get changes for a specific file
DIFF=$(./report.attach-diff/scripts/report.attach-diff.sh -- src/app.ts)

# Embed in report
echo "<pre><code>$DIFF</code></pre>" >> report.html
```
