#!/usr/bin/env bash
set -euo pipefail
# Start recording the preview browser as a WebM video
# Usage: view-record-start.sh

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"view-record-start\",\"params\":{}}" > /dev/null

echo "Recording started"
