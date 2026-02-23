#!/bin/bash
# Skill: Show HTML/JS UI to the user in the canvas panel
# Usage: widget-create.sh <html-content> [--wait]

WAIT=false
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--wait" ]; then
    WAIT=true
  else
    ARGS+=("$arg")
  fi
done

HTML="${ARGS[0]:?Usage: widget-create.sh <html-content> [--wait]}"

# Fixed internal name — there's only one canvas
NAME="canvas"

# Build JSON payload using node for safe escaping
PAYLOAD=$(node -e "
  const p = {name:process.argv[1],html:process.argv[2]};
  process.stdout.write(JSON.stringify(p));
" "$NAME" "$HTML")

RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Canvas opened"
else
  echo "Failed to open canvas: $BODY" >&2
  exit 1
fi

# If --wait flag, poll for result
if [ "$WAIT" = true ]; then
  TIMEOUT=60
  INTERVAL=1
  ELAPSED=0

  while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    RESULT_RESPONSE=$(curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget/${NAME}/result")

    STATUS=$(echo "$RESULT_RESPONSE" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        try{const j=JSON.parse(d);process.stdout.write(j.status||'error')}catch{process.stdout.write('error')}
      });
    ")

    if [ "$STATUS" = "ready" ]; then
      echo "$RESULT_RESPONSE" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
          try{const j=JSON.parse(d);console.log(JSON.stringify(j.result))}catch{console.log(d)}
        });
      "
      exit 0
    fi

    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
  done

  echo "Timeout waiting for user response after ${TIMEOUT}s" >&2
  exit 1
fi
