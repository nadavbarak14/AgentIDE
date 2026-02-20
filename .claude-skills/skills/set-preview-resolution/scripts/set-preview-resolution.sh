#!/bin/bash
# Set the preview browser to a custom resolution
# Usage: set-preview-resolution.sh <width> <height>
WIDTH="$1"
HEIGHT="$2"

if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  echo "Usage: set-preview-resolution.sh <width> <height>"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"set_preview_resolution\",\"params\":{\"width\":\"${WIDTH}\",\"height\":\"${HEIGHT}\"}}" > /dev/null

echo "Set preview resolution to ${WIDTH}x${HEIGHT}"
