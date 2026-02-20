#!/bin/bash
# Show a specific panel in the C3 IDE
# Usage: show-panel.sh <panel-name>
PANEL_ARG="$1"

if [ -z "$PANEL_ARG" ]; then
  echo "Usage: show-panel.sh <panel-name>"
  echo "Panel names: files, git, preview"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"show_panel\",\"params\":{\"panel\":\"${PANEL_ARG}\"}}" > /dev/null

echo "Opened ${PANEL_ARG} panel"
