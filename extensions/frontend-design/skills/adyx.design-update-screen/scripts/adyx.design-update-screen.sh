#!/bin/bash
# Skill: Update a screen in Frontend Design extension
NAME="${1:?Usage: design-update-screen.sh <screen-name> <html-content>}"
HTML="${2:?Usage: design-update-screen.sh <screen-name> <html-content>}"

PAYLOAD=$(node -e "
  const p = {command:'design.update_screen',params:{name:process.argv[1],html:process.argv[2]}};
  process.stdout.write(JSON.stringify(p));
" "$NAME" "$HTML")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Updated screen \"$NAME\" in Frontend Design"
