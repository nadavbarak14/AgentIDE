#!/bin/bash
# Skill: Export slide deck (sends board command notification)
OUTPUT="${1:?Usage: slides-export-pptx.sh <output-path>}"

PAYLOAD=$(node -e "
  const p = {command:'slides.export_pptx', params:{output:process.argv[1]}};
  process.stdout.write(JSON.stringify(p));
" "$OUTPUT")

curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" > /dev/null

echo "Export triggered for \"$OUTPUT\""
