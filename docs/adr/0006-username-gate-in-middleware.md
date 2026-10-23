# Usernames are required by a middleware gate, not a NOT NULL column

Every rider must have a username, but `users.username` allows NULL. A Google sign-up creates the `users` row (via the `handle_new_user` trigger) before the rider has picked a username, so a NOT NULL constraint would break OAuth sign-up. Instead, middleware sends any signed-in rider without a username to `/onboarding/username` before they can use the app.

## Consequences

- The gate and every page read `users.username`; `public.users` is the only home of a rider's username, display name, and avatar. Sign-in metadata is only sign-up input to the `handle_new_user` trigger, which keeps the username only if it is valid and free (otherwise NULL, so the rider lands on onboarding); nothing reads or writes identity in metadata afterwards.
- The gate costs one primary-key read of `users` per gated request. If that read fails, the request is let through rather than trapping riders behind onboarding while the database is unreachable.
