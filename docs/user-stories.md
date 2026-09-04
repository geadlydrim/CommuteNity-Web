# User Stories

Format: *As a [persona], I want [capability] so that [outcome].* Acceptance uses Given/When/Then.

Personas: Daily Rider, New Arrival, Knowledge Holder, Occasional Commuter — see `docs/product-vision.md`.

There is **no sprint map**. Work is feature-by-feature via Coordinator.

---

## A. Live product (web feed)

These describe the current app. Gaps that are only backlog (password reset, delete post, pagination, reputation counts) are listed under Backlog in `.cursor/agents/BACKLOG.md`, not as P0 stories here.

**US-100 — Sign up with email**
> As a **Knowledge Holder**, I want to create an account with email, password, username, and display name so that I can post under a public handle.

- Given I am on sign-up, when I submit valid email, password, username, and display name, then I am signed in.
- Given that email is already used, when I submit, then I see an error to sign in instead.

**US-101 — Sign in with Google**
> As an **Occasional Commuter**, I want to sign in with Google so that I do not keep another password.

- Given I complete Google OAuth without a username, when I land, then I am sent to `/onboarding/username` before using the app.
- Given I already have a username, when I finish OAuth, then I reach the home feed.

**US-102 — Read the public feed**
> As a **New Arrival**, I want to read commute posts without an account so that I can learn before I trust the community enough to sign up.

- Given I am signed out on `/`, when the page loads, then I see public posts.
- Given I am signed out, when I try to compose, then I am prompted to sign in.

**US-103 — Publish a post**
> As a **Knowledge Holder**, I want to publish a short post so that riders see a tip I would otherwise only tell in person.

- Given I am signed in, when I submit a body of 1–500 characters, then the post appears on the landing feed and on `/u/{my-username}`.
- Given the save fails, when I submit, then I see an error toast and can retry.

**US-104 — Vote on a post**
> As a **Daily Rider**, I want to upvote or downvote a post so that useful tips rise.

- Given I am signed in, when I tap up or down, then my vote is stored and the count updates.
- Given I vote again the same way, when I tap, then the vote is cleared.

**US-105 — Comment**
> As a **Daily Rider**, I want to comment on a post so that I can add a correction without making a new thread.

- Given I am signed in, when I submit a comment of 1–500 characters, then it appears on that post.
- Given I am on `/p/{id}` or the focus overlay, when comments load, then I can read the thread.

**US-106 — Share a post**
> As an **Occasional Commuter**, I want a link to one post so that I can send it to a family member.

- Given I use Share, when the browser supports Web Share, then I can share the permalink `/p/{id}`.
- Given it does not, when I share, then the link is copied.

**US-107 — Attach a pin-list map to a post**
> As a **Knowledge Holder**, I want to drop origin and destination (and optional waypoints) so that readers see the path, not only text.

- Given I add a map in the composer, when I save a valid pin list, then the feed shows a static map preview (no WebGL).
- Given I open that post in focus, when the map loads, then I see the interactive map with the same pins.

**US-108 — Public profile**
> As a **New Arrival**, I want to open `/u/{username}` so that I can see who wrote a post.

- Given the username exists, when I open the profile, then I see display name, @handle, and that user’s posts.
- Given I am viewing my own profile, when the page loads, then I can edit display name / username (30-day username cooldown) and avatar. Given I am viewing someone else, then I do not.

**US-109 — Open a post in focus**
> As a **Daily Rider**, I want to open a post without losing the feed so that I can read comments and the map.

- Given I am on the landing feed, when I open a post, then the focus overlay matches `/p/{id}`.
- Given I load `/p/{id}` cold, when the page renders, then I see that post.

Guide maps on comments are **in flight**. Do not add acceptance here until Coordinator closes that feature.

---

## B. Parked catalog (unbuilt UI)

Original route/stop/offline stories. **No screens.** Schema for routes/stops/votes exists; that is not done. Do not implement from this section without a new Planner brief and Coordinator approval.

Keep IDs US-001–016 so old plan.md references still resolve.

**US-001 — Basic route lookup** (unbuilt)
> As a **New Arrival**, I want origin and destination to yield a commute plan so that I can reach an unfamiliar place without asking strangers.

**US-002 — Multi-mode route** (unbuilt)
> As a **Daily Rider**, I want combined modes so that a result is an end-to-end trip.

**US-003 — Offline route access** (unbuilt; offline is not current MVP)
> As an **Occasional Commuter**, I want a route I already opened when I have no data.

**US-004 — Browse routes by mode** (unbuilt)

**US-005 — Route detail** (unbuilt)

**US-006 — Stop detail** (unbuilt)

**US-007 — Submit a new route** (unbuilt)

**US-008 — Propose a route edit** (unbuilt)

**US-009 — Submit a new stop** (unbuilt)

**US-010 — Upvote an approved route** (unbuilt; distinct from post votes)

**US-011 — Flag inaccurate catalog content** (unbuilt)

**US-012 — Auto-approve high-voted catalog contribution** (SQL trigger exists; no UI)

**US-013 / US-014** — superseded by US-100 / US-101.

**US-015 — View contribution counts and reputation** (unbuilt; `reputation` column exists)

**US-016 — Cached catalog offline** (unbuilt; same parking as US-003)
