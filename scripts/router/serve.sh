#!/usr/bin/env bash
# Start (default) or stop the local Valhalla router on 127.0.0.1:8002.
# Usage: scripts/router/serve.sh [start|stop]
# Then set ROUTER_URL=http://127.0.0.1:8002 in .env.local.
set -euo pipefail
. "$(dirname "$0")/env.sh"

V="$ROUTER_HOME/valhalla"

case "${1:-start}" in
  start)
    [ -f "$V/valhalla.json" ] || { echo "Run scripts/router/build.sh first." >&2; exit 1; }
    "$CONTAINER_RUNTIME" rm -f "$ROUTER_CONTAINER" >/dev/null 2>&1 || true
    "$CONTAINER_RUNTIME" run -d --name "$ROUTER_CONTAINER" --memory 2g \
      -p "127.0.0.1:$ROUTER_PORT:8002" -v "$V:/data:ro,Z" "$VALHALLA_IMAGE" \
      valhalla_service /data/valhalla.json 2 >/dev/null
    for _ in $(seq 60); do
      if curl -fs "http://127.0.0.1:$ROUTER_PORT/status" >/dev/null; then
        echo "router up on http://127.0.0.1:$ROUTER_PORT"
        exit 0
      fi
      sleep 1
    done
    echo "router did not come up; see: $CONTAINER_RUNTIME logs $ROUTER_CONTAINER" >&2
    exit 1 ;;
  stop)
    "$CONTAINER_RUNTIME" rm -f "$ROUTER_CONTAINER" >/dev/null 2>&1 || true
    echo "router stopped" ;;
  *)
    echo "Usage: $0 [start|stop]" >&2
    exit 2 ;;
esac
