#!/bin/bash
# Skill: Remove a slide from Slide Deck extension
NAME="${1:?Usage: slides-remove-slide.sh <slide-name>}"

PAYLOAD=$(node -e "
  const p = {command:'slides.remove_slide', params:{name:process.argv[1]}};
  process.stdout.write(JSON.stringify(p));
" "$NAME")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Removed slide \"$NAME\" from Slide Deck"
