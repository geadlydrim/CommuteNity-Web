#!/usr/bin/env bash
# Python venv for run.py / render.py (pyproj, shapely, pillow, requests).
set -euo pipefail
. "$(dirname "$0")/env.sh"
python3 -m venv "$ROUTER_HOME/venv"
"$ROUTER_HOME/venv/bin/pip" install -q pyproj shapely pillow numpy requests
