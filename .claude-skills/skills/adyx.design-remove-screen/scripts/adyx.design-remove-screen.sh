#!/bin/bash
# Skill: Remove a screen from Frontend Design extension
NAME="${1:?Usage: design-remove-screen.sh <screen-name>}"

PAYLOAD=$(node -e "
  const p = {command:'design.remove_screen',params:{name:process.argv[1]}};
  process.stdout.write(JSON.stringify(p));
" "$NAME")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Removed screen \"$NAME\" from Frontend Design"
