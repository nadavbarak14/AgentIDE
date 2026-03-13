#!/bin/bash
# Open the web preview panel and navigate to a URL
# Usage: open-preview.sh <url>
URL_ARG="$1"

if [ -z "$URL_ARG" ]; then
  echo "Usage: open-preview.sh <url>"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"show_panel\",\"params\":{\"panel\":\"preview\",\"url\":\"${URL_ARG}\"}}" > /dev/null

echo "Opened preview panel with ${URL_ARG}"
