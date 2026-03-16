#!/usr/bin/env bash
set -euo pipefail
# Attach a video recording to the work report assets directory.
# Usage: report.attach-video.sh <source-path>

SOURCE="${1:?Usage: report.attach-video.sh <source-path>}"

# Validate source file exists
if [ ! -f "$SOURCE" ]; then
  echo "Error: File not found: $SOURCE" >&2
  exit 1
fi

# Validate file extension
EXT="${SOURCE##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
case "$EXT_LOWER" in
  webm|mp4|mov) ;;
  *)
    echo "Error: Unsupported video format '.$EXT_LOWER'. Supported: webm, mp4, mov" >&2
    exit 1
    ;;
esac

# Create assets directory
mkdir -p .report-assets

# Copy with timestamp prefix for uniqueness
TIMESTAMP=$(date +%s%N 2>/dev/null || date +%s)
BASENAME=$(basename "$SOURCE")
DEST=".report-assets/${TIMESTAMP}-${BASENAME}"

cp "$SOURCE" "$DEST"

echo "$DEST"
