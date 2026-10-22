# Post maps and guides are versioned JSON documents, not tables

A post map is stored in `posts.map_data` and a guide in `comments.map_data`, each as a versioned JSONB document whose shape is checked with Zod (`src/lib/schemas/`) before saving and again before rendering. The database only checks that the value is an object or null. We chose this over relational tables (and over reusing the catalog's `stops` and `routes`) because these maps are a rider's own illustration of their post or comment, not shared catalog data: they need no joins, no moderation, and no reuse across posts, and their shape is still changing.

## Consequences

- Changing the shape means adding a new `version`. Older documents must still parse, so readers handle every version ever written.
- Zod objects drop unknown keys, so a new field has to be added to the schema before anything stores it.
