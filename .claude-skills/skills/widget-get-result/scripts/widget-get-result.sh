#!/bin/bash
# Skill: Wait for the user's response from the canvas UI
# Usage: widget-get-result.sh

# Fixed internal name — there's only one canvas
NAME="canvas"

TIMEOUT=60
INTERVAL=1
ELAPSED=0

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  RESPONSE=$(curl -s "http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/widget/${NAME}/result")

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
    echo "No canvas is open" >&2
    exit 1
  fi

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "Timeout waiting for user response after ${TIMEOUT}s" >&2
exit 1
