# Supabase (Postgres + PostGIS) as the backend

Supabase provides the database, auth (email and Google), file storage, and row-level security. We chose it over Firebase, Cloudflare (Workers + D1), and a local-only app: transit data is geospatial and relational (routes through stops), which Firestore handles poorly and PostGIS handles natively; Cloudflare lacks built-in auth and PostGIS; a community product needs a shared database. Postgres also keeps lock-in low. Rules about who can read or write what live in RLS policies and triggers in `supabase/migrations/`, not in app code.

## Consequences

- The free tier can pause after inactivity; move to Pro when that becomes a problem.
