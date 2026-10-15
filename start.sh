#!/bin/sh
# Start the Agentopolis server if it isn't running, then open it in an Orca browser tab.
PORT="${AGENT_OFFICE_PORT:-4747}"
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="http://127.0.0.1:$PORT/"

if ! curl -s -o /dev/null "$URL"; then
  nohup node "$DIR/server.mjs" --port "$PORT" ${AGENTOPOLIS_NAME:+--name "$AGENTOPOLIS_NAME"} >"$DIR/server.log" 2>&1 &
  i=0
  until curl -s -o /dev/null "$URL" || [ $i -ge 20 ]; do i=$((i + 1)); sleep 0.25; done
fi

if command -v orca >/dev/null 2>&1; then
  orca tab create --url "$URL" >/dev/null && echo "Opened $URL in Orca" && exit 0
fi
open "$URL" && echo "Opened $URL in your browser"
