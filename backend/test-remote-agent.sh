#!/usr/bin/env bash
set -e

# ─── Remote Agent Manual Test ───
# This script starts the agent, starts the hub, adds a remote worker, and runs smoke tests.
# Press Ctrl+C to stop everything.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SSH_KEY="$HOME/.ssh/agentide_test"
AGENT_PORT=4100
HUB_PORT=3003

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  [ -n "$AGENT_PID" ] && kill $AGENT_PID 2>/dev/null && echo "Stopped agent (PID $AGENT_PID)"
  [ -n "$HUB_PID" ] && kill $HUB_PID 2>/dev/null && echo "Stopped hub (PID $HUB_PID)"
  exit 0
}
trap cleanup EXIT INT TERM

echo -e "${YELLOW}=== Remote Agent Test ===${NC}"
echo ""

# 1. Start the agent
echo -e "${YELLOW}[1/4] Starting remote agent on port $AGENT_PORT...${NC}"
npx tsx src/remote-agent-entry.ts --port $AGENT_PORT &
AGENT_PID=$!
sleep 2

# Verify agent is running
if curl -sf http://127.0.0.1:$AGENT_PORT/api/health > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ Agent running on port $AGENT_PORT${NC}"
else
  echo -e "${RED}  ✗ Agent failed to start${NC}"
  exit 1
fi

# 2. Start the hub
echo -e "${YELLOW}[2/4] Starting hub on port $HUB_PORT...${NC}"
PORT=$HUB_PORT npx tsx src/hub-entry.ts &
HUB_PID=$!
sleep 3

if curl -sf http://127.0.0.1:$HUB_PORT/api/health > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ Hub running on port $HUB_PORT${NC}"
else
  echo -e "${RED}  ✗ Hub failed to start${NC}"
  exit 1
fi

# 3. Add remote worker pointing to localhost
echo -e "${YELLOW}[3/4] Adding remote worker (SSH to localhost, agent port $AGENT_PORT)...${NC}"
WORKER_RESPONSE=$(curl -sf -X POST http://127.0.0.1:$HUB_PORT/api/workers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test-Remote",
    "sshHost": "127.0.0.1",
    "sshPort": 22,
    "sshUser": "'"$USER"'",
    "sshKeyPath": "'"$SSH_KEY"'",
    "remoteAgentPort": '"$AGENT_PORT"'
  }' 2>&1) || true

WORKER_ID=$(echo "$WORKER_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$WORKER_ID" ]; then
  echo -e "${GREEN}  ✓ Worker created: $WORKER_ID${NC}"
else
  echo -e "${RED}  ✗ Failed to create worker${NC}"
  echo "  Response: $WORKER_RESPONSE"
  echo ""
  echo -e "${YELLOW}  (If worker already exists, that's fine — continuing)${NC}"
fi

sleep 2

# 4. Smoke tests directly against the agent
echo -e "${YELLOW}[4/4] Running smoke tests...${NC}"
echo ""

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local cmd="$2"
  local expect="$3"

  result=$(eval "$cmd" 2>&1) || true
  if echo "$result" | grep -q "$expect"; then
    echo -e "  ${GREEN}✓${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name"
    echo "    Expected: $expect"
    echo "    Got: $(echo "$result" | head -1)"
    FAIL=$((FAIL + 1))
  fi
}

# Agent direct tests
run_test "Agent health" \
  "curl -sf http://127.0.0.1:$AGENT_PORT/api/health" \
  '"status":"ok"'

run_test "Register session" \
  "curl -sf -X POST http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/register -H 'Content-Type: application/json' -d '{\"workingDirectory\":\"$SCRIPT_DIR\"}'" \
  '"watching":true'

run_test "List files" \
  "curl -sf http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/files" \
  '"entries"'

run_test "Read file" \
  "curl -sf 'http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/files/content?path=package.json'" \
  '"language"'

run_test "Search" \
  "curl -sf 'http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/search?q=express'" \
  '"results"'

run_test "Git diff" \
  "curl -sf http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/diff" \
  '"diff"'

run_test "Unregister session" \
  "curl -sf -X DELETE http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/register" \
  '"stopped":true'

run_test "404 after unregister" \
  "curl -sf http://127.0.0.1:$AGENT_PORT/api/sessions/test-1/files || echo 'not registered'" \
  'not registered'

echo ""
echo -e "${YELLOW}Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
else
  echo -e "${RED}Some tests failed.${NC}"
fi

echo ""
echo -e "${YELLOW}Hub running at: http://$(hostname -I | awk '{print $1}'):$HUB_PORT${NC}"
echo -e "${YELLOW}Open this URL from your Windows browser to test the UI.${NC}"
echo ""
echo "Press Ctrl+C to stop."
wait
