#!/bin/bash
# Open a file in the C3 IDE file viewer panel
# Usage: open-file.sh <path> [line]
PATH_ARG="$1"
LINE_ARG="${2:-}"

if [ -z "$PATH_ARG" ]; then
  echo "Usage: open-file.sh <file-path> [line-number]"
  exit 1
fi

if [ -z "$C3_HUB_PORT" ] || [ -z "$C3_SESSION_ID" ]; then
  echo "Error: C3_HUB_PORT and C3_SESSION_ID environment variables are required"
  exit 1
fi

PARAMS="{\"path\":\"${PATH_ARG}\""
if [ -n "$LINE_ARG" ]; then
  PARAMS="${PARAMS},\"line\":\"${LINE_ARG}\""
fi
PARAMS="${PARAMS}}"

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "{\"command\":\"open_file\",\"params\":${PARAMS}}" > /dev/null

echo "Opened ${PATH_ARG}${LINE_ARG:+ at line $LINE_ARG} in file viewer"
