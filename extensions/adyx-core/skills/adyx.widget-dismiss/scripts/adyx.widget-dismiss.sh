#!/bin/bash
# Skill: Close the canvas UI panel
# Usage: widget-dismiss.sh

# Fixed internal name — there's only one canvas
NAME="canvas"

RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget/${NAME}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Canvas closed"
else
  echo "Failed to close canvas: $BODY" >&2
  exit 1
fi
