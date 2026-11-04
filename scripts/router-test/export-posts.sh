#!/usr/bin/env bash
# Read-only export of posts.map_data and comments.map_data (pins and labels only) to $ROUTER_HOME/db/.
# Run from a checkout that has .env.local with SUPABASE_DB_URL.
set -euo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$ROUTER_HOME/db"
set -a; . ./.env.local; set +a
npx supabase db query --db-url "$SUPABASE_DB_URL" -o json "select map_data from posts where map_data is not null" > "$ROUTER_HOME/db/posts.json"
npx supabase db query --db-url "$SUPABASE_DB_URL" -o json "select map_data from comments where map_data is not null" > "$ROUTER_HOME/db/comments.json"
