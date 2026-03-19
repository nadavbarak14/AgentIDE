#!/bin/bash
# Skill: Add a screen to Frontend Design extension
NAME="${1:?Usage: design-add-screen.sh <screen-name> <html-content>}"
HTML="${2:?Usage: design-add-screen.sh <screen-name> <html-content>}"

# Build JSON payload using jq-style escaping via node
PAYLOAD=$(node -e "
  const p = {command:'design.add_screen',params:{name:process.argv[1],html:process.argv[2]}};
  process.stdout.write(JSON.stringify(p));
" "$NAME" "$HTML")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Added screen \"$NAME\" to Frontend Design"
