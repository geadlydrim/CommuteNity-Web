#!/usr/bin/env bash
# Build Valhalla tiles from the downloaded extract with the pinned official
# image, under a 4 GB memory cap (no admin areas, time zones, or elevation).
# Run download.sh first. Takes a while and replaces any previous tiles.
set -euo pipefail
. "$(dirname "$0")/env.sh"

V="$ROUTER_HOME/valhalla"
[ -f "$ROUTER_HOME/pbf/$PBF_NAME" ] || { echo "Run scripts/router/download.sh first." >&2; exit 1; }

rm -rf "$V/tiles"
mkdir -p "$V/tiles"
"$CONTAINER_RUNTIME" pull -q "$VALHALLA_IMAGE" >/dev/null

"$CONTAINER_RUNTIME" run --rm --memory 4g --memory-swap 4g \
  -v "$ROUTER_HOME/pbf:/pbf:ro,Z" -v "$V:/data:Z" "$VALHALLA_IMAGE" bash -c '
set -e
valhalla_build_config --mjolnir-tile-dir /data/tiles --mjolnir-timezone "" --mjolnir-admin "" \
  --mjolnir-traffic-extract "" --mjolnir-transit-dir "" --mjolnir-tile-extract "" > /data/valhalla.json
valhalla_build_tiles -c /data/valhalla.json /pbf/'"$PBF_NAME"'
'
du -sh "$V/tiles"
