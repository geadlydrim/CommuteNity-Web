# Street paths come from a self-hosted Valhalla behind our own proxy

Street paths on post maps and guides are routed by Valhalla, an open-source routing engine we run ourselves on the OpenStreetMap Philippines extract, and only our server calls it (ADR 0003). We chose it over hosted routing APIs and over OSRM:
- **One instance:** a single set of routing data serves both car and walking profiles.
- **Vias:** it routes through a leg's vias without splitting the leg.
- **Per-request options:** avoiding tolls and expressways, and its bus profile, are chosen per request.
- **Measured:** it is the only engine we measured against real Metro Manila jeepney and bus routes.

## Considered Options

- **Hosted APIs.** Mapbox, Stadia, Google, GraphHopper's hosted API and the free FOSSGIS servers forbid storing results, forbid commercial use, or forbid high-traffic sites. Geoapify allows storing results, but bills a credit for every hop between points. Because the builder routes while the author edits, its free tier covers only about 60 guides a day. Its free plan also requires Geoapify attribution, and we never tested it.
- **OSRM.** It needs a separate dataset for each profile, so car and walking mean two of them. Options such as avoiding tolls are fixed when its data is built, not chosen per request. We never measured it on our routes.

## Consequences

- **Hosting:** someone has to run the router and refresh its OSM data. During development it runs on a workstation, and where it runs in production is still undecided.
- **When the router isn't available:** if `ROUTER_URL` is unset or the router fails, legs draw a straight line. CI stubs the router and never calls a real one.
- **Switching engines later is cheap:** saved paths are line shapes that are never re-routed, and the browser only talks to our proxy, so an engine swap touches only the proxy.
- **Limits the proxy enforces:**
  - only signed-in riders can route;
  - at most 12 points per request (2 pins and 10 vias), all within the Philippines;
  - car routes up to 500 km, walking up to 25 km;
  - 60 requests per minute per rider;
  - a 5-second timeout;
  - responses carry only the path, its length and its time.
