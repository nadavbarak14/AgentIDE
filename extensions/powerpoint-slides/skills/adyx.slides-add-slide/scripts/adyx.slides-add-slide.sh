#!/bin/bash
# Skill: Add a slide to Slide Deck extension
NAME="${1:?Usage: slides-add-slide.sh <slide-name> <html-content> [speaker-notes]}"
HTML="${2:?Usage: slides-add-slide.sh <slide-name> <html-content> [speaker-notes]}"
NOTES="${3:-}"

PAYLOAD=$(node -e "
  const p = {command:'slides.add_slide', params:{name:process.argv[1], html:process.argv[2], notes:process.argv[3]||''}};
  process.stdout.write(JSON.stringify(p));
" "$NAME" "$HTML" "$NOTES")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Added slide \"$NAME\" to Slide Deck"
