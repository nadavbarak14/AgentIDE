#!/bin/bash
# Skill: Update a slide in Slide Deck extension
NAME="${1:?Usage: slides-update-slide.sh <slide-name> <html-content> [speaker-notes]}"
HTML="${2:?Usage: slides-update-slide.sh <slide-name> <html-content> [speaker-notes]}"
NOTES="${3:-}"

PAYLOAD=$(node -e "
  const p = {command:'slides.update_slide', params:{name:process.argv[1], html:process.argv[2], notes:process.argv[3]||''}};
  process.stdout.write(JSON.stringify(p));
" "$NAME" "$HTML" "$NOTES")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Updated slide \"$NAME\" in Slide Deck"
