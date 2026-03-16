---
name: report.export-github
description: "Convert the HTML work report to GitHub-compatible markdown with uploaded images and videos. Returns the PR body text."
---

# Export Work Report to GitHub

Reads `report.html` from the current directory, uploads referenced images and videos to GitHub, converts the HTML to markdown, and outputs the PR-ready body text.

## Usage

```bash
./report.export-github/scripts/report.export-github.sh [--repo owner/repo]
```

## Parameters

- `--repo` (optional): GitHub repository in `owner/repo` format. Defaults to the origin remote of the current git repo.

## Output

Prints the GitHub-compatible markdown to stdout. Images are replaced with GitHub-hosted URLs. Videos are converted to mp4 (if ffmpeg is available) and uploaded.

## Prerequisites

- `gh` CLI must be authenticated
- `ffmpeg` (optional) for WebM-to-mp4 video conversion

## Example

```bash
# Export and use as PR body
BODY=$(./report.export-github/scripts/report.export-github.sh)
gh pr create --title "feat: add user auth" --body "$BODY"

# Specify repo explicitly
BODY=$(./report.export-github/scripts/report.export-github.sh --repo myorg/myrepo)
```
