#!/usr/bin/env bash
# Start (default) or stop Valhalla on 127.0.0.1:8002. Usage: serve-valhalla.sh [start|stop]
set -euo pipefail
. "$(dirname "$0")/env.sh"
V="$ROUTER_HOME/valhalla"
case "${1:-start}" in
  start)
    podman rm -f cn-valhalla >/dev/null 2>&1 || true
    podman run -d --name cn-valhalla --memory 2g -p 127.0.0.1:$VALHALLA_PORT:8002 \
      -v "$V:/data:ro,Z" "$VALHALLA_IMAGE" valhalla_service /data/valhalla.json 2
    for i in $(seq 60); do
      curl -fs "http://127.0.0.1:$VALHALLA_PORT/status" >/dev/null && { echo "valhalla up on :$VALHALLA_PORT"; exit 0; }
      sleep 1
    done; echo "valhalla did not come up"; exit 1 ;;
  stop) podman rm -f cn-valhalla ;;
esac
