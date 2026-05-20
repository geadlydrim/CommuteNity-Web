# User Stories

Stories are grouped by feature area, then by persona. Format: *As a [persona], I want [capability] so that [outcome].* Acceptance criteria use **Given/When/Then**.

---

## 1. Route Search

**US-001 — Basic route lookup**
> As a **New Arrival**, I want to enter an origin and destination and get a step-by-step commute plan so that I can reach an unfamiliar place without asking strangers.

Acceptance Criteria:
- Given I am on the search screen, when I type an origin and destination and tap Search, then I see at least one route result within 3 seconds.
- Given a result exists, when I view it, then I see each leg with: mode, board stop, alight stop, approximate fare, estimated duration.
- Given no route exists for my query, when results load, then I see a clear "no routes found" message with a prompt to contribute.

**US-002 — Multi-mode route**
> As a **Daily Rider**, I want routes that combine multiple transit modes so that I can plan end-to-end trips, not just single-mode legs.

Acceptance Criteria:
- Given a route requires jeepney then MRT then walking, when I view the result, then all three legs are shown in order with a transfer instruction at each interchange.

**US-003 — Offline route access**
> As an **Occasional Commuter**, I want to access a route I already looked up even when I have no data signal so that I can navigate without worrying about connectivity.

Acceptance Criteria:
- Given I have previously searched and viewed a route, when I open the app with no network connection, then I can still see that route from local cache.
- Given I am offline, when I try to search a new route, then I see a clear offline notice and only cached results.

---

## 2. Route & Stop Browsing

**US-004 — Browse routes by mode**
> As a **Daily Rider**, I want to filter routes by transit mode so that I can find all jeepney routes in my area without seeing MRT lines.

Acceptance Criteria:
- Given I am on the browse screen, when I select a mode filter (e.g. "Jeepney"), then only routes of that mode are shown.

**US-005 — Route detail view**
> As a **New Arrival**, I want to see the full stop sequence and per-segment fares for a route so that I know exactly where to board, where to alight, and how much to pay.

Acceptance Criteria:
- Given I tap a route, when the detail screen loads, then I see: route name, mode, all stops in order, fare for each segment, community notes (if any), last updated date.

**US-006 — Stop detail view**
> As an **Occasional Commuter**, I want to tap a stop and see which routes pass through it so that I can orient myself when I'm already at a location.

Acceptance Criteria:
- Given I tap a stop, when the detail screen loads, then I see the stop name, a map pin, the transit mode, and a list of routes that serve it.

---

## 3. Community Contribution

**US-007 — Submit a new route**
> As a **Knowledge Holder**, I want to submit a new jeepney route I know so that other commuters can benefit from my local knowledge.

Acceptance Criteria:
- Given I am signed in, when I tap "Add Route" and fill in name, mode, and at least two stops, then I can submit it.
- Given I submit, when the submission is saved, then I see a confirmation that it is pending review.
- Given I am not signed in, when I attempt to submit, then I am prompted to sign in first.

**US-008 — Propose a route edit**
> As a **Daily Rider**, I want to correct a wrong fare on an existing route so that other commuters aren't misled.

Acceptance Criteria:
- Given I am on a route detail screen, when I tap "Suggest Edit" and change a fare value, then I can submit the correction.
- Given I submit a correction, when it is saved, then the existing approved route is unchanged until the correction is approved.

**US-009 — Submit a new stop**
> As a **Knowledge Holder**, I want to add a missing jeepney stop so that routes can reference it.

Acceptance Criteria:
- Given I am signed in, when I tap "Add Stop," enter a name, drop a map pin, and select a mode, then I can submit it.
- Given I submit, when saved, then the stop enters pending state visible to moderators and high-rep users.

---

## 4. Voting & Trust

**US-010 — Upvote an approved route**
> As a **Daily Rider**, I want to upvote a route that I found accurate so that others can see it's trustworthy.

Acceptance Criteria:
- Given I am signed in and on a route detail screen, when I tap the upvote button, then my vote is recorded and the vote count increments.
- Given I have already voted, when I tap again, then my vote is toggled off.

**US-011 — Flag inaccurate content**
> As a **New Arrival**, I want to flag a route with a wrong fare so that moderators can review and correct it.

Acceptance Criteria:
- Given I am signed in, when I tap "Flag" on a route and select a reason (wrong fare, outdated, duplicate, spam), then a report is submitted.
- Given I am not signed in, when I tap "Flag," then I am prompted to sign in.

**US-012 — Auto-approve high-voted contribution**
> As a **Knowledge Holder**, I want my accurate submission to go live once enough riders verify it so that I don't have to wait for a manual moderator.

Acceptance Criteria:
- Given a pending route has received 5 net upvotes (configurable threshold), when the vote threshold is crossed, then its status automatically changes to approved and it appears in search results.

---

## 5. User Accounts

**US-013 — Sign up with email**
> As a **Knowledge Holder**, I want to create an account with my email so that I can contribute and build a reputation.

Acceptance Criteria:
- Given I am on the sign-up screen, when I enter a valid email, password, and display name and tap Register, then my account is created and I am signed in.
- Given I enter an email already in use, when I tap Register, then I see an error telling me to sign in instead.

**US-014 — Sign in with Google**
> As an **Occasional Commuter**, I want to sign in with my Google account so that I don't need to remember another password.

Acceptance Criteria:
- Given I am on the sign-in screen, when I tap "Sign in with Google" and complete the OAuth flow, then I am signed in and directed to the home screen.

**US-015 — View my profile**
> As a **Knowledge Holder**, I want to see my contribution count and reputation score so that I can track my impact.

Acceptance Criteria:
- Given I am signed in, when I open my profile, then I see my display name, total approved contributions, total pending contributions, and current reputation score.

---

## 6. Offline

**US-016 — View cached content offline**
> As a **Daily Rider**, I want to see my recently viewed routes even when I have no internet so that I'm not stranded mid-commute.

Acceptance Criteria:
- Given I have viewed Route X while online, when I go offline and navigate to Route X, then the cached version of that route is displayed with a "Cached" indicator and the last-synced timestamp.

---

## Story Map (Priority Order for Sprint 1)

| Priority | Story | Sprint |
|---|---|---|
| P0 | US-013, US-014 (Auth) | Sprint 1 |
| P0 | US-005, US-006 (Route/Stop detail) | Sprint 1 |
| P0 | US-001 (Route search) | Sprint 1 |
| P1 | US-004 (Browse by mode) | Sprint 1 |
| P1 | US-016 (Offline) | Sprint 1 |
| P1 | US-007, US-008, US-009 (Contributions) | Sprint 2 |
| P2 | US-010, US-011, US-012 (Voting) | Sprint 2 |
| P2 | US-002 (Multi-mode routes) | Sprint 2 |
| P3 | US-003, US-015 | Sprint 3 |
