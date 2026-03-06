#!/bin/bash
curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d '{"command":"ext.select_text","params":{"extension":"powerpoint-slides"}}' > /dev/null
echo "Text selection enabled on Slide Deck"
