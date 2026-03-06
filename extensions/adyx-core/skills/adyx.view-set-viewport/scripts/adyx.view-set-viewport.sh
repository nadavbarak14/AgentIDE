#!/usr/bin/env bash
set -euo pipefail
# Set preview browser viewport mode
# Usage: adyx.view-set-viewport.sh <desktop|mobile> [deviceId]

if [ -z "${1:-}" ]; then
  echo "Usage: adyx.view-set-viewport.sh <desktop|mobile> [deviceId]"
  echo "  desktop              - Full-width responsive viewport"
  echo "  mobile <deviceId>    - Mobile device preset"
  echo ""
  echo "Available devices: iphone-se, iphone-14, iphone-15-pro, iphone-16-pro-max,"
  echo "  galaxy-s24, pixel-8, ipad-mini, ipad-air, ipad-pro-11, ipad-pro-13, galaxy-tab-s9"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

MODE="$1"

if [ "$MODE" = "desktop" ]; then
  curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
    -H 'Content-Type: application/json' \
    -d '{"command":"view-set-desktop","params":{}}' > /dev/null
  echo "Viewport set to desktop mode"

elif [ "$MODE" = "mobile" ]; then
  DEVICE_ID="${2:-}"
  if [ -z "$DEVICE_ID" ]; then
    echo "Error: deviceId is required for mobile mode"
    echo "Example: adyx.view-set-viewport.sh mobile iphone-15-pro"
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
