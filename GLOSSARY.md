# CommuteNity

A community where Filipino commuters share how trips actually work (jeepneys, buses, rail, UV Express, tricycles), starting with Metro Manila.

## Language

### Riders

**Rider**:
A person using CommuteNity, signed in or not.
_Avoid_: user, member, account

**Username**:
A rider's unique public @name; changeable once every 30 days.
_Avoid_: handle

**Display name**:
A rider's free-text public name shown beside their username.
_Avoid_: nickname, full name

### Feed

**Post**:
A short public message (1–500 characters) shared to the feed, optionally carrying a map.
_Avoid_: thread, tip, status

**Feed**:
The newest-first list of public posts.
_Avoid_: timeline, wall

**Comment**:
A reply to a post, optionally carrying a guide.
_Avoid_: reply, response

**Post vote**:
A rider's +1 or −1 on a post; a rider holds at most one per post.
_Avoid_: like, reaction

**Focus view**:
One post opened with its comments and an interactive map, either over the feed or at its own link.
_Avoid_: modal, overlay, detail page

### Maps

**Pin**:
A named place on a map.
_Avoid_: marker, point, location

**Post map**:
An ordered set of pins with no modes: the first is the **Origin**, the last is the **Destination**, any between are **Waypoints**.
_Avoid_: route map, pin list, route

**Guide**:
A trip made of legs, each with its own mode, joined by transfers.
_Avoid_: guide map, directions, itinerary, route

**Leg**:
One part of a guide traveled by a single mode, from an origin pin to a destination pin.
_Avoid_: segment, step, hop

**Transfer**:
The switch from one leg to the next within a guide.
_Avoid_: connector, connection

**Mode**:
A kind of transport: jeepney, bus, MRT, LRT, UV Express, P2P, tricycle, or walking.
_Avoid_: vehicle, transport type

**Straight line**:
The direct line drawn between consecutive pins when no street path exists.
_Avoid_: chord, geodesic

**Street path**:
The road-following line drawn between consecutive pins.
_Avoid_: polyline, route line, snapped route

### Catalog (parked)

**Catalog**:
The structured, community-approved set of routes and stops.
_Avoid_: database, directory

**Route**:
A named catalog line served by one mode, such as a jeepney line.
_Avoid_: line, path (and never use it for a post map or guide)

**Stop**:
A catalog boarding or alighting point.
_Avoid_: station, terminal, pin

**Segment**:
One stop-to-stop part of a route, with its fare.
_Avoid_: leg

**Edit proposal**:
A suggested change to an approved catalog entry.
_Avoid_: edit, correction

**Report**:
A flag that a catalog entry is wrong, outdated, duplicated, or spam.
_Avoid_: complaint, ticket

**Catalog vote**:
A rider's +1 or −1 on a catalog entry or edit proposal, which decides whether it is approved.
_Avoid_: post vote, like
