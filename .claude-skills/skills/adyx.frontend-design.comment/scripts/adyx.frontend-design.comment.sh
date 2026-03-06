#!/bin/bash
SCREEN="${1:-}"
PARAMS='{"extension":"frontend-design"}'
if [ -n "$SCREEN" ]; then
  PARAMS='{"extension":"frontend-design","screen":"'"$SCREEN"'"}'
fi
curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d '{"command":"ext.comment","params":'"$PARAMS"'}' > /dev/null
echo "Requested feedback on Frontend Design"
