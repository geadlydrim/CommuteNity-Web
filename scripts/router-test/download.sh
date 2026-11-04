#!/usr/bin/env bash
# Download the Geofabrik Philippines extract and verify it against Geofabrik's .md5.
# Geofabrik's "-latest" name redirects to a dated file; we pin the dated name (see env.sh).
set -euo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$ROUTER_HOME/pbf"
cd "$ROUTER_HOME/pbf"
[ -f "$PBF_NAME" ] || curl -fSL -o "$PBF_NAME" "$PBF_URL"
want=$(curl -fsS "$PBF_URL.md5" | cut -d' ' -f1)
have=$(md5sum "$PBF_NAME" | cut -d' ' -f1)
echo "geofabrik md5 $want"; echo "local md5    $have"
[ "$want" = "$have" ] && echo "md5 OK" || { echo "md5 MISMATCH"; exit 1; }
