#!/usr/bin/env bash
# OSRM car (MLD). Usage: osrm.sh build | start | stop. Build needs ~6.5 GiB: only run with >= 9 GiB available.
set -euo pipefail
. "$(dirname "$0")/env.sh"
O="$ROUTER_HOME/osrm"
case "${1:?build|start|stop}" in
  build)
    avail=$(free -m | awk '/^Mem:/{print $7}')
    [ "$avail" -ge 9216 ] || { echo "only ${avail} MiB available (< 9 GiB): refusing to build OSRM"; exit 2; }
    mkdir -p "$O"; cp -n "$ROUTER_HOME/pbf/$PBF_NAME" "$O/"
    R="podman run --rm --memory 7g --memory-swap 7g -v $O:/data:Z $OSRM_IMAGE"
    /usr/bin/time -v $R osrm-extract -p /opt/car.lua /data/$PBF_NAME
    $R osrm-partition /data/${PBF_NAME%.osm.pbf}.osrm
    $R osrm-customize /data/${PBF_NAME%.osm.pbf}.osrm
    rm -f "$O/$PBF_NAME"; du -sh "$O" ;;
  start)
    podman rm -f cn-osrm >/dev/null 2>&1 || true
    podman run -d --name cn-osrm --memory 7g -p 127.0.0.1:$OSRM_PORT:5000 -v "$O:/data:ro,Z" "$OSRM_IMAGE" \
      osrm-routed --algorithm mld --max-viaroute-size 50 /data/${PBF_NAME%.osm.pbf}.osrm ;;
  stop) podman rm -f cn-osrm ;;
esac
