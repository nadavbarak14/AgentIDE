#!/usr/bin/env bash
set -euo pipefail
# Type text into an element by accessible role and name
# Usage: view-type.sh <role> <name> <text>

if [ -z "${1:-}" ] || [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
  echo "Usage: view-type.sh <role> <name> <text>"
  echo "Example: view-type.sh textbox \"Email\" \"user@test.com\""
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

# Generate unique request ID
REQ_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N)

# Send board command with waitForResult
curl -s -X POST "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"view-type\",\"params\":{\"role\":\"$1\",\"name\":\"$2\",\"text\":\"$3\"},\"requestId\":\"${REQ_ID}\",\"waitForResult\":true}" > /dev/null

# Poll for result (up to 35s)
for i in $(seq 1 70); do
  RESULT=$(curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command-result/${REQ_ID}")

  # Check if result is ready (has "result" field, not "status":"pending")
  if echo "$RESULT" | grep -q '"result"'; then
    echo "$RESULT" | sed 's/.*"result"://' | sed 's/}$//'
    exit 0
  fi

  sleep 0.5
done

echo "Error: Timeout waiting for type result"
exit 1
