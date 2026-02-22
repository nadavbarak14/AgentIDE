#!/bin/bash
# Skill: Dismiss (remove) a widget
NAME="${1:?Usage: widget-dismiss.sh <widget-name>}"
ENCODED_NAME=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$NAME")

RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget/${ENCODED_NAME}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Widget \"$NAME\" dismissed"
else
  echo "Failed to dismiss widget \"$NAME\": $BODY" >&2
  exit 1
fi
