#!/usr/bin/env bash
# Download the Geofabrik Philippines extract into $ROUTER_HOME/pbf and check it
# against Geofabrik's published md5. Skips the download when the file is already there.
set -euo pipefail
. "$(dirname "$0")/env.sh"

mkdir -p "$ROUTER_HOME/pbf"
cd "$ROUTER_HOME/pbf"

if [ ! -f "$PBF_NAME" ]; then
  curl -fSL --retry 3 -o "$PBF_NAME.part" "$PBF_URL"
  mv "$PBF_NAME.part" "$PBF_NAME"
fi

want=$(curl -fsS "$PBF_URL.md5" | cut -d' ' -f1)
have=$(md5sum "$PBF_NAME" | cut -d' ' -f1)
echo "geofabrik md5 $want"
echo "local md5    $have"
if [ "$want" != "$have" ]; then
  echo "md5 MISMATCH: delete $ROUTER_HOME/pbf/$PBF_NAME and run this again" >&2
  exit 1
fi
echo "md5 OK"
