#!/usr/bin/env bash
set -euo pipefail
# Set preview browser viewport mode
# Usage: adyx.view-set-viewport.sh <desktop|mobile> [deviceId]

if [ -z "${1:-}" ]; then
  echo "Usage: adyx.view-set-viewport.sh <desktop|mobile> [deviceId]"
  echo "  desktop [desktopId]  - Desktop viewport (optional: macbook-air-13, macbook-pro-14, macbook-pro-16,"
  echo "                         desktop-1080p, desktop-1440p, desktop-4k, desktop-1366, desktop-1280)"
  echo "  mobile <deviceId>    - Mobile device preset"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

MODE="$1"

if [ "$MODE" = "desktop" ]; then
  DESKTOP_ID="${2:-}"
  if [ -n "$DESKTOP_ID" ]; then
    curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
      -H 'Content-Type: application/json' \
      -d "{\"command\":\"view-set-desktop\",\"params\":{\"desktopId\":\"${DESKTOP_ID}\"}}" > /dev/null
    echo "Viewport set to desktop mode: ${DESKTOP_ID}"
  else
    curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
      -H 'Content-Type: application/json' \
      -d '{"command":"view-set-desktop","params":{}}' > /dev/null
    echo "Viewport set to desktop mode"
  fi

elif [ "$MODE" = "mobile" ]; then
  DEVICE_ID="${2:-}"
  if [ -z "$DEVICE_ID" ]; then
    echo "Error: deviceId is required for mobile mode"
    echo "Example: adyx.view-set-viewport.sh mobile iphone-17-pro"
    exit 1
  fi
  curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
    -H 'Content-Type: application/json' \
    -d "{\"command\":\"view-set-device\",\"params\":{\"deviceId\":\"${DEVICE_ID}\"}}" > /dev/null
  echo "Viewport set to mobile device: ${DEVICE_ID}"

else
  echo "Error: Unknown mode '$MODE'. Use 'desktop' or 'mobile'."
  exit 1
fi
