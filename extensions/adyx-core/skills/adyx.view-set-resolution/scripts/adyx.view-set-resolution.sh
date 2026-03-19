#!/usr/bin/env bash
set -euo pipefail
# Set the preview browser viewport to a custom resolution
# Usage: view-set-resolution.sh <width> <height>

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "Usage: view-set-resolution.sh <width> <height>"
  echo "Example: view-set-resolution.sh 768 1024"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"view-set-resolution\",\"params\":{\"width\":$1,\"height\":$2}}" > /dev/null

echo "Resolution set to ${1}x${2}"
