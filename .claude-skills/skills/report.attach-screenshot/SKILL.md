---
name: report.attach-screenshot
description: "Copy a screenshot image to the work report assets directory and return its relative path for embedding in report.html."
---

# Attach Screenshot to Work Report

Copies a screenshot image file into the report's `.report-assets/` directory so it can be referenced in the HTML work report.

## Usage

```bash
./report.attach-screenshot/scripts/report.attach-screenshot.sh <source-path>
```

## Parameters

- `source-path` (required): Absolute path to the screenshot file. Supported formats: PNG, JPG, JPEG, GIF, WEBP.

## Output

Prints the relative path to stdout. Use this path in your report HTML:

```
.report-assets/1710576000000-screenshot.png
```

## Example

```bash
# Attach a screenshot taken with /view.screenshot
PATH=$(./report.attach-screenshot/scripts/report.attach-screenshot.sh /tmp/screenshot.png)
echo "<img src=\"$PATH\" alt=\"Screenshot\">" >> report.html
```
