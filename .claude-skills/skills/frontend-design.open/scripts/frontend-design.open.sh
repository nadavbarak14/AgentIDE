#!/bin/bash
curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d '{"command":"show_panel","params":{"panel":"ext:frontend-design"}}' > /dev/null
echo "Opened Frontend Design panel"
