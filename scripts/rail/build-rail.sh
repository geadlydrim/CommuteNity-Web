#!/usr/bin/env bash
# Rebuild src/lib/rail/rail-lines.json from the Geofabrik Philippines extract
# the router uses (scripts/router/download.sh fetches it). Needs python3; the
# first run creates a venv with pyosmium under $RAIL_HOME (needs network).
# Reads the extract a few times; takes seconds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/../router/env.sh"

RAIL_HOME="${RAIL_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/commutenity/rail}"
pbf="$ROUTER_HOME/pbf/$PBF_NAME"
out="$here/../../src/lib/rail/rail-lines.json"

if [ ! -f "$pbf" ]; then
  echo "Missing $pbf. Run scripts/router/download.sh first." >&2
  exit 1
fi

if [ ! -x "$RAIL_HOME/venv/bin/python" ]; then
  python3 -m venv "$RAIL_HOME/venv"
  "$RAIL_HOME/venv/bin/pip" install --quiet osmium
fi

"$RAIL_HOME/venv/bin/python" "$here/build_rail.py" "$pbf" "$PBF_NAME" "$out"
echo "Wrote $out"
