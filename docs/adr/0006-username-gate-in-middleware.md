# Usernames are required by a middleware gate, not a NOT NULL column

Every rider must have a username, but `users.username` allows NULL. A Google sign-up creates the `users` row (via the `handle_new_user` trigger) before the rider has picked a username, so a NOT NULL constraint would break OAuth sign-up. Instead, middleware sends any signed-in rider without a username to `/onboarding/username` before they can use the app.

## Consequences

- The gate reads the username from the auth user's metadata, while pages read `users.username`; both are written on onboarding and on profile edits, and nothing reconciles them if one write fails.
