#!/bin/bash
# Skill: Poll for a widget result
NAME="${1:?Usage: widget-get-result.sh <widget-name>}"
ENCODED_NAME=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$NAME")

TIMEOUT=60
INTERVAL=1
ELAPSED=0

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  RESPONSE=$(curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget/${ENCODED_NAME}/result")

  STATUS=$(echo "$RESPONSE" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const j=JSON.parse(d);process.stdout.write(j.status||'error')}catch{process.stdout.write('error')}
    });
  ")

  if [ "$STATUS" = "ready" ]; then
    echo "$RESPONSE" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        try{const j=JSON.parse(d);console.log(JSON.stringify(j.result))}catch{console.log(d)}
      });
    "
    exit 0
  fi

  if [ "$STATUS" = "error" ]; then
    echo "Widget \"$NAME\" not found" >&2
    exit 1
  fi

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "Timeout waiting for widget \"$NAME\" result after ${TIMEOUT}s" >&2
exit 1
