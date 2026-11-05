# Shared settings for the local router scripts. Sourced, not run:
#   . scripts/router/env.sh
# Everything is overridable from the environment.

# Data lives in a user cache directory, never in the repo (ADR 0007).
export ROUTER_HOME="${ROUTER_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/commutenity/router}"

# Geofabrik's "-latest" name redirects to a dated file, so we pin the dated name.
# When Geofabrik drops it, pick a newer one from https://download.geofabrik.de/asia/philippines.html
export PBF_NAME="${PBF_NAME:-philippines-261102.osm.pbf}"
export PBF_URL="${PBF_URL:-https://download.geofabrik.de/asia/$PBF_NAME}"

# Official Valhalla image, pinned.
export VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla:3.9.1}"
export ROUTER_CONTAINER="${ROUTER_CONTAINER:-cn-valhalla}"
export ROUTER_PORT=8002

# Podman if installed, else Docker. Override with CONTAINER_RUNTIME=docker|podman.
if [ -z "${CONTAINER_RUNTIME:-}" ]; then
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_RUNTIME=docker
  else
    echo "Install Podman or Docker to run the local router." >&2
    return 1 2>/dev/null || exit 1
  fi
fi
export CONTAINER_RUNTIME
