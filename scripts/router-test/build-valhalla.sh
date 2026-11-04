#!/usr/bin/env bash
# Build Valhalla tiles (no admins, timezones or elevation) under a 4 GiB memory cap.
set -euo pipefail
. "$(dirname "$0")/env.sh"
V="$ROUTER_HOME/valhalla"
mkdir -p "$V/tiles"
podman pull -q "$VALHALLA_IMAGE" >/dev/null
podman run --rm --memory 4g --memory-swap 4g \
  -v "$ROUTER_HOME/pbf:/pbf:ro,Z" -v "$V:/data:Z" "$VALHALLA_IMAGE" bash -c '
set -e
valhalla_build_config --mjolnir-tile-dir /data/tiles --mjolnir-timezone "" --mjolnir-admin "" \
  --mjolnir-traffic-extract "" --mjolnir-transit-dir "" --mjolnir-tile-extract "" > /data/valhalla.json
time valhalla_build_tiles -c /data/valhalla.json /pbf/'"$PBF_NAME"'
'
du -sh "$V/tiles"
