# Shared settings for the router test harness. Source me: `. scripts/router-test/env.sh`
export ROUTER_HOME="${ROUTER_HOME:-$HOME/.cache/commutenity/router}"
export PBF_NAME="${PBF_NAME:-philippines-261102.osm.pbf}"
export PBF_URL="${PBF_URL:-https://download.geofabrik.de/asia/philippines-261102.osm.pbf}"
export VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla:3.9.1}"
export OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v26.11.0}"
export VALHALLA_PORT=8002
export OSRM_PORT=5000
