---
name: report.attach-video
description: "Copy a video recording to the work report assets directory and return its relative path for embedding in report.html."
---

# Attach Video to Work Report

Copies a video recording into the report's `.report-assets/` directory so it can be referenced in the HTML work report.

## Usage

```bash
./report.attach-video/scripts/report.attach-video.sh <source-path>
```

## Parameters

- `source-path` (required): Absolute path to the video file. Supported formats: WebM, MP4, MOV.

## Output

Prints the relative path to stdout:

```
.report-assets/1710576000000-recording.webm
```

## Example

```bash
# Attach a recording captured with /view.record-stop
PATH=$(./report.attach-video/scripts/report.attach-video.sh /tmp/recording.webm)
echo "<video src=\"$PATH\" controls></video>" >> report.html
```
