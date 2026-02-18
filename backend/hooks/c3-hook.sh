#!/usr/bin/env bash
# C3 Dashboard Hook — called by Claude Code on SessionEnd and Stop events.
# Reads JSON from stdin, extracts event info, and POSTs to C3 Hub API.

# Read JSON from stdin
INPUT=$(cat)

# Extract fields from JSON
EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name',''))" 2>/dev/null)
CLAUDE_SID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# C3_SESSION_ID and C3_HUB_PORT are set by the PTY spawner
HUB_PORT="${C3_HUB_PORT:-3000}"
C3_SID="${C3_SESSION_ID:-}"

# Skip if no C3 session ID (not spawned by C3)
if [ -z "$C3_SID" ]; then
  exit 0
fi

# POST to the C3 hooks API
curl -s -X POST "http://localhost:${HUB_PORT}/api/hooks/event" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"${EVENT}\",\"c3SessionId\":\"${C3_SID}\",\"claudeSessionId\":\"${CLAUDE_SID}\",\"cwd\":\"${CWD}\"}" \
  >/dev/null 2>&1 &

exit 0
