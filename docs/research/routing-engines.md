# Routing engines for street paths

Research for the street-paths map, ticket 01 ("Routing engines for Philippine street paths"). Researched 2026-11-02. This file records facts and a shortlist; **it does not choose a provider**. Later tickets make that choice.

How to read it:

- Every claim links to the page that supports it, usually an official doc, a source file, or a published pricing or terms page.
- **[INFERENCE]** marks a conclusion that no primary source states outright.
- **[MEASURED]** marks a number from our own run on 2026-11-02 (see [Measured on the Philippines extract](#measured-on-the-philippines-extract)). Those numbers come from one machine, not from vendor docs.
- Vocabulary: routing engines call every input point a "waypoint". In our terms (`GLOSSARY.md`), a **pin** becomes a waypoint that starts or ends a leg, and a **via** becomes a pass-through waypoint that does not split the leg. Our own **Waypoint** (a middle pin of a post map) is unrelated to the engines' use of the word.

## What the design asks of a router

These come from the street-paths map and ADR 0003. They are the yardstick for every row below.

1. Only our server calls the router; browsers never call a routing service directly (ADR 0003).
2. The builder routes while the author edits, on each pin move or drag of the path, so requests arrive in bursts.
3. The returned geometry is **stored** in `map_data` and redrawn later. It is never re-routed on display.
4. Every leg uses the car profile today. Walking is being reconsidered in a separate ticket.
5. Vias force the street path through a point without splitting the leg.
6. If routing fails, the straight line stays.

Points 1 and 3 decide most hosted options: a provider has to allow server-side calls **and** permanent storage of its results.

## Shortlist (no decision)

1. **Valhalla, self-hosted.** One tile set serves both car (`auto`) and walking (`pedestrian`) [MEASURED]. Location types map directly onto our vias: `through` and `via` points do not split the leg, while `break` points do ([docs](https://valhalla.github.io/valhalla/api/route/api-reference/); [MEASURED]). Each leg's shape is a polyline with 6-digit precision. For the Philippines, building the tiles took about 2.5 min, fit under a 4 GiB memory cap, and produced 570 MiB of tiles. The service used about 0.1 GiB RSS after test queries [MEASURED]. MIT license. Caveats:
   - The default `auto` limit is 20 locations, which the config can raise.
   - `/route` has no simplification option.
   - The docs say "There is also ongoing work to improve support for through locations."
2. **OSRM, self-hosted.** It answered fastest in our test (7–34 ms per route) [MEASURED]. The `waypoints` parameter turns the coordinates it doesn't list into silent vias: a request with one via returned 1 leg [MEASURED]. It can return `polyline`, `polyline6` or `geojson`, but you must request `overview=full`, because the default `simplified` cut a 432-point path to 14 points [MEASURED]. BSD-2 license. The cost is that each processed dataset serves exactly one profile, so walking needs a second dataset and a second server process. For the Philippines, each profile took about 3–3.5 min to preprocess, peaked at 5.6–6.3 GiB RAM, and used about 2 GiB of disk and about 1.3 GiB RAM to serve [MEASURED].
3. **Geoapify, hosted.** Of the hosted providers checked, it is the only one whose published pages allow storing and redistributing routing results without tying that to a paid plan: "you can store and redistribute your results" ([routing page](https://www.geoapify.com/routing-api/)). The free plan allows commercial use, with 3,000 credits a day and up to 5 requests per second ([pricing](https://www.geoapify.com/pricing/)). `pass_through` vias are supported, and the response is GeoJSON with optional polyline5/6. Caveats:
   - Every hop between consecutive waypoints costs a credit.
   - The pages don't name the routing engine.
   - No simplification parameter is documented.
   - OpenStreetMap attribution is mandatory.

   **Runner-up: LocationIQ, paid plans only.** For customers, the ToS says "You can store response data forever". Free accounts may cache for only 48 h, which doesn't fit stored paths ([ToS](https://locationiq.com/tos)).

The options left out and why are in [Not shortlisted](#not-shortlisted-and-why).

## Comparison: engines (self-hosted)

| | OSRM | Valhalla | GraphHopper | openrouteservice (ORS) |
|---|---|---|---|---|
| License | BSD-2 ([LICENSE](https://github.com/Project-OSRM/osrm-backend/blob/master/LICENSE.TXT)) | MIT ([README](https://github.com/valhalla/valhalla/blob/master/README.md)) | Apache-2.0 ([README](https://github.com/graphhopper/graphhopper/blob/master/README.md)) | GPL-3.0 ([LICENSE](https://github.com/GIScience/openrouteservice/blob/main/LICENSE)) |
| Version tested | v26.11.0 | 3.9.1 | 11.1 | v10.1.0 |
| How vias are expressed | Coordinate list; `waypoints=` lists the indices that start or end legs, and every other coordinate is a pass-through ([http.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)) | `locations[].type`: `break` / `through` / `via` / `break_through` ([route API](https://valhalla.github.io/valhalla/api/route/api-reference/)) | `points` with optional vias; `pass_through=true` avoids u-turns at vias but needs `ch.disable=true` ([api-doc](https://github.com/graphhopper/graphhopper/blob/master/docs/web/api-doc.md); [MEASURED]) | `coordinates` (start, vias, end); every coordinate starts a new segment ([request docs](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types)) |
| Vias split the leg? | No, when `waypoints` is set [MEASURED] | No for `through` / `via`; yes for `break` [MEASURED] | One path with no per-leg geometry; `snapped_waypoints` marks where the points fall [MEASURED] | Yes: the response has one `segment` per pair of consecutive coordinates ([docs](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types)); a via produced 2 segments [MEASURED] |
| Point limit (default) | 500 (`--max-viaroute-size`, [routed.cpp](https://github.com/Project-OSRM/osrm-backend/blob/master/src/tools/routed.cpp)) | auto 20, pedestrian 50 ([valhalla_build_config](https://github.com/valhalla/valhalla/blob/master/scripts/valhalla_build_config)); 21 locations returned `Exceeded max locations: 20` [MEASURED] | No count cap found; 1,000 km between consecutive points in flexible mode ([config-example.yml](https://github.com/graphhopper/graphhopper/blob/master/config-example.yml)) | 50 waypoints, 100 km per route ([service config](https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/service)) |
| Car + walking | `car.lua`, `foot.lua`; **one profile per dataset** ([http.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)) | `auto`, `pedestrian` and others, chosen per request on one tile set ([route API](https://valhalla.github.io/valhalla/api/route/api-reference/); [MEASURED]) | `car`, `foot` profiles in one graph; adding or changing a profile needs a re-import ([deploy.md](https://github.com/graphhopper/graphhopper/blob/master/docs/core/deploy.md)) | `driving-car`, `foot-walking`, … ; one graph directory per profile ([profiles](https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/)) |
| Walking path differs from car? | Yes: Cubao→Quiapo was 9.20 km by car, 8.50 km on foot [MEASURED] | Yes: 9.0 km vs 8.6 km [MEASURED] | Yes: 9.01 km vs 9.95 km [MEASURED] | Yes: 9.09 km vs 9.64 km [MEASURED]; the encoder decides which ways are edges and their speeds ([profiles](https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/)) |
| Geometry | `polyline` (precision 5, default), `polyline6`, `geojson` | One `shape` per leg, polyline precision 6; `format=osrm` adds `shape_format` = `polyline6` / `polyline5` / `geojson` | Encoded polyline, multiplier `1e5` by default (`points_encoded_multiplier=1e6` works [MEASURED]); `points_encoded=false` returns a GeoJSON LineString | JSON: polyline precision 5 (with elevation it needs a custom decoder); `/geojson`: LineString ([decoding](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/geometry-decoding)) |
| Simplification | `overview=simplified` is the **default** and generalises to a zoom level; `full` and `false` are the other options | None on `/route` | Ramer-Douglas-Peucker on by default; `way_point_max_distance` (default 0.5) controls it: 0 gave 360 points, the default 150, and 10 gave 29 [MEASURED] | `geometry_simplify` (off by default). The docs say it "cannot be applied to routes with more than one segment", yet v10.1.0 accepted it with a via and cut 297 points to 113 [MEASURED] |
| PH preprocessing [MEASURED] | car: 3.5 min, peak 6.26 GiB; foot: 3.0 min, peak 5.59 GiB | 2.4 min; peak RSS 10.5 GiB when uncapped, mostly memory-mapped files: it finished under a 4 GiB cap and was OOM-killed under 2 GiB | car (with CH and turn costs) + foot: 7.1 min (CH alone 5.7 min), peak RSS 3.43 GiB with `-Xmx6g` | car + foot (default config): 12.8 min from container start to ready, peak RSS 4.96 GiB with `XMX=4g` |
| PH on disk [MEASURED] | 1.88 GiB car + 2.09 GiB foot | 570 MiB tiles (572 MiB as a tar) | 481 MiB graph-cache (car + foot) | 541 MiB car + 577 MiB foot |
| Serving RAM [MEASURED] | about 1.24 GiB car, about 1.31 GiB foot | about 0.09 GiB RSS after test queries | about 0.78 GiB RSS (`-Xmx2g`) | about 4.3 GiB RSS with `XMX=4g` [INFERENCE: this reflects the configured heap more than the real need] |
| Official Docker image | `ghcr.io/project-osrm/osrm-backend` ([README](https://github.com/Project-OSRM/osrm-backend/blob/master/README.md)) | `ghcr.io/valhalla/valhalla`, `valhalla-scripted` ([docker README](https://github.com/valhalla/valhalla/blob/master/docker/README.md)) | None; the README links a community image | `openrouteservice/openrouteservice` ([release compose](https://github.com/GIScience/openrouteservice/releases/download/v10.1.0/docker-compose.yml)) |
| Updating OSM data | Re-run extract → partition → customize [INFERENCE: no incremental update is documented] | Rebuild the tiles; the scripted image rebuilds when the PBF's md5 changes ([docker README](https://github.com/valhalla/valhalla/blob/master/docker/README.md)) | Re-import ([config-example.yml](https://github.com/graphhopper/graphhopper/blob/master/config-example.yml)) | Rebuild the graphs (`REBUILD_GRAPHS=True`, [running with docker](https://giscience.github.io/openrouteservice/run-instance/running-with-docker)) |

## Comparison: hosted options

"Proxy" means calling the provider from our server on behalf of a browser user. "Store" means keeping the returned geometry permanently in our database and redrawing it.

| Provider (engine / data) | Max points per request; vias | Car / walk | Free tier | Paid | Rate limit | Proxy from our server | Store results | Geometry |
|---|---|---|---|---|---|---|---|---|
| FOSSGIS public servers: `routing.openstreetmap.de` (OSRM), `valhalla1.openstreetmap.de` (Valhalla); OSM | Not published; Valhalla's are "a bit stricter than the defaults" ([maintainer](https://github.com/valhalla/valhalla/discussions/3373#discussioncomment-1644713)) | car, bike, foot ([about](https://routing.openstreetmap.de/about.html)); all Valhalla costings | Free, with conditions | None | "Maximum one request per second" ([terms](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/)) | Not addressed, but "Websites with high traffic volumes are generally not permitted", and commercial use only if not "a substantial part of an online offering" | Not addressed (ODbL applies) | Same as the engines |
| GraphHopper Directions API; OSM ([profiles](https://docs.graphhopper.com/openapi/map-data-and-routing-profiles/openstreetmap/standard-routing-profiles)) | "Max. locations per request": Free 5, Basic 30, Standard 80, Premium 200 ([pricing](https://www.graphhopper.com/pricing/)) [INFERENCE: the [FAQ](https://www.graphhopper.com/faq/exceed-location-or-vehicle-limit/) example is about Route Optimization, so whether the cap applies to `/route` is unclear]; `pass_through` needs flexible mode, which Free lacks | Free: `car`, `bike`, `foot` only | 500 credits/day; "for non-commercial use only" | €69 / €199 / €479 per month (5k / 15k / 50k credits/day); a 2–10 point route costs 1 credit ([credits](https://support.graphhopper.com/support/solutions/articles/44000718211-what-is-one-credit-)) | 1 / 2 / 10 req/s on paid plans; Free not published | "To redistribute the Directions API you need a custom package" ([ToS §5.2](https://www.graphhopper.com/terms/)) | "may be temporarily cached on the client side" only (§5.2) | polyline 1e5 or `[lon,lat]` arrays |
| openrouteservice (HeiGIT); OSM | 50 waypoints, 6,000 km car/foot ([restrictions, Wayback 2025-12-28](https://web.archive.org/web/20251228035741/https://openrouteservice.org/restrictions/)) | `driving-car`, `foot-walking`, … | Standard: Directions 2,000/day, 40/min ([plans](https://account.heigit.org/info/plans)) | Collaborative (non-profit, academic, government): 10,000/day, 60/min; no paid tier listed | 40/min per key | Recommended: "Send any request to the HeiGIT API server-side" ([FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)) | No caching clause; results "are licensed under CC-BY-SA 4.0" ([ToS](https://account.heigit.org/info/tos)) | polyline5 or GeoJSON |
| Mapbox Directions; OSM plus commercial and government data ([sources](https://docs.mapbox.com/help/dive-deeper/mapbox-data-sources/)) | 25 coordinates; `waypoints=` makes silent vias but "Must be used in conjunction with `steps=true`" ([docs](https://docs.mapbox.com/api/navigation/directions/)) | `driving`, `driving-traffic`, `walking`, `cycling` | 100,000 requests/month ([pricing](https://www.mapbox.com/pricing)) | $2.00 / $1.60 / $1.20 per 1,000 | 300/min | Allowed [INFERENCE: no clause bans server-side Directions calls] | **Forbidden**: "Customer shall not export, download, cache or store results from any request to a Navigation API." ([Product Terms 2.10.1, 2026-10-20](https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6ad79764a359d21b46049ea4_Mapbox%20Product%20Terms%20(October%2020%2C%202026).pdf)) | polyline5/6 or GeoJSON; `overview` full or simplified |
| Stadia Maps (Valhalla); OSM, about weekly ([docs](https://docs.stadiamaps.com/routing/)) | 50 locations; Valhalla location types ([limits](https://docs.stadiamaps.com/routing/standard-routing/)) | `auto`, `pedestrian`, … | 200k credits/month, "Commercial use not allowed" ([pricing](https://stadiamaps.com/pricing/)) | $20 / $80 / $250 per month; a route costs 20 credits | No fixed req/s ([FAQ](https://stadiamaps.com/faqs/)) | **Forbidden**: "proxying or caching access to our Services in any way" ([ToS](https://stadiamaps.com/terms-of-service/)) | **Not granted**: server-side caching "is prohibited"; permanent storage is permitted only for Geocoding | polyline6 |
| Geoapify (engine not named); OSM | 1,000 waypoints; `pass_through` mode ([docs](https://apidocs.geoapify.com/docs/routing/)) | `drive`, `walk`, … | 3,000 credits/day, 5 req/s, commercial use OK ([pricing](https://www.geoapify.com/pricing/)) | $59 / $109 / $179 per month (10k / 25k / 50k credits/day) | 5–20 req/s by plan | Allowed [INFERENCE: keys can be restricted by IP; no proxy clause in the [terms](https://www.geoapify.com/terms-and-conditions/)] | **Allowed**: "you can store and redistribute your results" ([routing page](https://www.geoapify.com/routing-api/)) | GeoJSON MultiLineString, one line per leg; `details=polyline5,polyline6` |
| LocationIQ (OSRM-style API [INFERENCE]); OSM ([attribution](https://locationiq.com/attribution)) | 25 coordinates; `waypoints=` ([docs](https://docs.locationiq.com/docs/directions-api)) | `driving`, `walking` (walking capped at 100 km) | 5,000/day, 2 req/s, "Limited Commercial Use" ([pricing](https://locationiq.com/pricing)) | $100 / $200 / $500 per month | 20–30 req/s on paid plans | Allowed [INFERENCE: no clause against it] | **Paid: allowed** ("You can store response data forever"); **free: 48 h** ([ToS](https://locationiq.com/tos)) | polyline5/6 or GeoJSON; `overview` |
| Google Routes; Google or licensor data | n/a | n/a | n/a | n/a | n/a | n/a | **Forbidden**: "must not use … the Routes API in conjunction with a non-Google map", and lat/lng can be cached for at most 30 days ([service terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms)) | n/a |

## Not shortlisted, and why

- **GraphHopper, self-hosted.** It works: Apache-2.0, car and foot in one 481 MiB graph, and a 7-minute import [MEASURED]. It adds nothing Valhalla lacks for our use, though:
  - in its fast mode (CH), `pass_through` vias are refused with "currently not supported for speed mode" [MEASURED];
  - a profile without CH (foot in the default config) needs `ch.disable=true` on every request [MEASURED];
  - the only Docker image is a community one ([README](https://github.com/graphhopper/graphhopper/blob/master/README.md)).
- **openrouteservice, self-hosted.** It's GPL-3.0 and built on GraphHopper. Every coordinate starts a new segment, and there is no pass-through flag [MEASURED]. Its default `maximum_distance` is 100 km, and it was the slowest of the four to build in our run (12.8 min). It has no advantage over Valhalla or OSRM for this use.
- **openrouteservice, hosted (HeiGIT).** It's free and server-side calls are the recommended pattern, but:
  - 40 directions per minute per key would be shared by every author routing on each edit;
  - no paid plan is listed;
  - results are CC-BY-SA 4.0, which would apply share-alike to geometry stored inside riders' posts [INFERENCE];
  - openrouteservice.org currently says it "is currently shut down due to the current PHP issues" ([site](https://openrouteservice.org/)).

  It could serve a prototype.
- **FOSSGIS public OSRM and Valhalla.** They allow 1 request per second, refuse high-traffic sites, allow commercial use only when it's not substantial, run on a single server with "We do not guarantee availability", and can withdraw permission "at any time" ([terms](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/)). ADR 0003 already rules out calling a public demo server from the browser. Calling one from our server still runs into the same policy.
- **GraphHopper hosted.** The ToS allows only temporary client-side caching, and redistribution needs a custom package (§5.2). The Free plan is non-commercial. It would need a written agreement.
- **Mapbox Directions.** The storage ban (Product Terms 2.10.1) conflicts with storing paths.
- **Stadia Maps.** Its terms ban proxying and server-side caching, and its docs say this covers relaying through your own servers ([securing your integration](https://docs.stadiamaps.com/guides/securing-your-integration/)). Storing routing results is never granted.
- **Google Routes API.** It can't be used on a non-Google map, and it caps caching at 30 days.

## Per engine

### OSRM

- **Vias.** Coordinates are a semicolon list, and `waypoints` "Treats input coordinates indicated by given indices as waypoints… Default is to treat all input coordinates as waypoints." Coordinates not listed are passed through without starting a new leg. Per-coordinate `bearings`, `radiuses` and `approaches` are available, and `continue_straight` "Forces the route to keep going straight at waypoints constraining uturns there even if it would be faster" ([http.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)). On current `master`, POST with a JSON body is also accepted (same page). The server limit is `max-viaroute-size`, default 500 ([routed.cpp](https://github.com/Project-OSRM/osrm-backend/blob/master/src/tools/routed.cpp)).
- **Profiles.** "Mode of transportation, is determined statically by the Lua profile that is used to prepare the data using `osrm-extract`" ([http.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)). Car and foot therefore need two datasets and two `osrm-routed` processes. The shipped profiles include `car.lua`, `foot.lua` and `bicycle.lua` ([profiles/](https://github.com/Project-OSRM/osrm-backend/tree/master/profiles)).
- **Self-hosting.** The pipeline is extract → partition → customize (MLD), or `osrm-contract` for CH ([README](https://github.com/Project-OSRM/osrm-backend/blob/master/README.md)).
  - The only documented sizing is for the whole planet (2021): about 415 GiB peak RAM to extract car, about 123 GiB to serve, and "The sizes scale roughly linear with input data size" ([wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Disk-and-Memory-Requirements)).
  - The README's one country example: "a Mexico's OSM file of 550.7MB took around 30 minutes to finish extraction".
  - Our Philippines run (584 MiB) took 2.9 min to extract car on 12 threads [MEASURED].
- **Hosted.** The project's usage-policy wiki now points to FOSSGIS ([wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)). FOSSGIS runs OSRM v5.27.1 with car, bike and foot, and data is "updated roughly every two days" ([about](https://routing.openstreetmap.de/about.html)). The project offers no commercial hosting [INFERENCE: none is listed in its README or wiki]. `router.project-osrm.org` answered a Manila `foot` request with the car result, so it looks car-only [INFERENCE from a single test, not documented].
- **Geometry.** `geometries` = `polyline` (default, precision 5) / `polyline6` / `geojson`. `overview` = `simplified` (default; "simplified according to highest zoom level it could be displayed on") / `full` / `false` ([http.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md)).

### Valhalla

- **Vias.** "you need to specify two break locations. In addition, you can include through, via or break_through locations to influence the route path." A `through` location neither allows u-turns nor generates legs. A `via` "allow[s] u-turns but do[es] not generate legs". "The types of the first and last locations are ignored and are treated as breaks" ([route API](https://valhalla.github.io/valhalla/api/route/api-reference/)). The same page warns: "There is also ongoing work to improve support for through locations."
- **Limits.** These are `service_limits` in the config. The generated defaults are auto 20 locations / 5,000 km, pedestrian 50 / 250 km, and bicycle, motor_scooter and motorcycle 50 / 500 km ([valhalla_build_config](https://github.com/valhalla/valhalla/blob/master/scripts/valhalla_build_config)).
- **Profiles.** The costings are `auto`, `bicycle`, `bus`, `truck`, `taxi`, `motor_scooter`, `motorcycle`, `pedestrian` and `multimodal`. Pedestrian `walking_speed` "Must be between 0.5 and 25 km/hr. Defaults to 5.1 km/hr" ([route API](https://valhalla.github.io/valhalla/api/route/api-reference/)). Costing is chosen per request: our single PH tile set answered both `auto` and `pedestrian` [MEASURED].
- **Self-hosting.** The build tools are `valhalla_build_config`, `valhalla_build_admins`, `valhalla_build_timezones` and `valhalla_build_tiles` ([building.md](https://github.com/valhalla/valhalla/blob/master/docs/docs/start/building.md)). Admins, timezones and elevation are optional ([docker README](https://github.com/valhalla/valhalla/blob/master/docker/README.md)). We found no RAM, disk or build-time guidance in the docs, so the measurements below fill that gap.
- **Hosted.** The project runs none of its own: "FOSSGIS e.V. hosts a demo server which is open to the public" ([README](https://github.com/valhalla/valhalla/blob/master/README.md)). The README asks apps to send an `X-Client-Id` header. The FOSSGIS terms apply. Stadia Maps sells hosted Valhalla (see the hosted table).
- **Geometry.** Each leg's `shape` is "an encoded polyline of the route path (with 6 digits decimal precision)". `shape_format` (`polyline6`, `polyline5`, `geojson`, `no_shape`) applies only with `format=osrm`, and `directions_type=none` drops the maneuvers ([route API](https://valhalla.github.io/valhalla/api/route/api-reference/)).

### GraphHopper

- **Vias.** `points` takes a start, a destination and optional via points. `pass_through`: "If true, u-turns are avoided at via-points with regard to the heading_penalty. Requires ch.disable=true" ([hosted API](https://docs.graphhopper.com/openapi/routing/postroute)). `headings` and `custom_model` also need flexible mode ([api-doc](https://github.com/graphhopper/graphhopper/blob/master/docs/web/api-doc.md)).
- **Profiles.** `car`, `foot` and `bike` are custom models. By default only car gets CH: "By default foot and bike are without CH preparation" ([config-example.yml](https://github.com/graphhopper/graphhopper/blob/master/config-example.yml)). "Adding or modifying profiles is not possible and you need to run a new import instead" ([deploy.md](https://github.com/graphhopper/graphhopper/blob/master/docs/core/deploy.md)).
- **Self-hosting.** For the planet: "~60GB RAM and takes ~3h for the import", plus CH for car with turn costs "~120GB RAM… ~25 hours" ([deploy.md](https://github.com/graphhopper/graphhopper/blob/master/docs/core/deploy.md)). Its `-Xmx` rule is "size of graph-cache minus the geometry file".
- **Hosted.** See the hosted table. The [ToS](https://www.graphhopper.com/terms/) also says "You are allowed to use the Directions API with and without showing a map" (§5.3). "All packages require OpenStreetMap attribution" (§3).
- **Geometry.** `points_encoded` defaults to true, with multiplier `1e5`. With `points_encoded=false`, coordinates come back as `[lon,lat]` ([api-doc](https://github.com/graphhopper/graphhopper/blob/master/docs/web/api-doc.md)). `way_point_max_distance` defaults to 0.5 in [RouteResource.java](https://github.com/graphhopper/graphhopper/blob/master/web-bundle/src/main/java/com/graphhopper/resources/RouteResource.java) and drives Ramer-Douglas-Peucker simplification. Its unit isn't documented, though our runs behave like metres [INFERENCE].

### openrouteservice

- **Vias.** `coordinates` is the waypoint list. Each consecutive pair becomes a `segment`, and `skip_segments` can drop segments ([RouteRequest.java](https://github.com/GIScience/openrouteservice/blob/main/ors-api/src/main/java/org/heigit/ors/api/requests/routing/RouteRequest.java)). There is no pass-through flag in the request model, so a via always splits the route into another segment (`way_points` `[0, 72, 296]` [MEASURED]). Self-hosted defaults are `maximum_way_points` 50 and `maximum_distance` 100,000 m ([service config](https://giscience.github.io/openrouteservice/run-instance/configuration/engine/profiles/service)).
- **Self-hosting.** The memory rule is "Rule of Thumb: <PBF-size> * <profiles> * 2" ([release compose](https://github.com/GIScience/openrouteservice/releases/download/v10.1.0/docker-compose.yml)), which comes to about 2.3 GB for the Philippines with car and foot [INFERENCE: arithmetic]. The docs give a near-sized example: "Baden-Württemberg is 450MB which can be built on a machine with around 2-4GB RAM" ([system requirements](https://giscience.github.io/openrouteservice/run-instance/system-requirements)). Our build with `XMX=4g` peaked at 4.96 GiB RSS and took 12.8 min [MEASURED].
- **Hosted.** See the hosted table. Public data updates take "two to three weeks" ([FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)).
- **Geometry.** JSON geometry is polyline precision 5. With `elevation`, "this encoded string can not be decoded with a standard polyline decoder" ([decoding](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/geometry-decoding)).

## OpenStreetMap data for the Philippines

Every OSM-based option above consumes the same OpenStreetMap data. Mapbox conflates OSM with commercial and government data, and Google uses its own. What differs between engines is how each profile reads the tags.

- **Input.** Geofabrik's `philippines-latest.osm.pbf` is **584 MB** and "contains all OSM data up to 2026-11-01T21:21:36Z". The dated file `philippines-261101.osm.pbf` is 612,512,721 bytes ([Geofabrik](https://download.geofabrik.de/asia/philippines.html)). Extracts are rebuilt "Once a day, around 21:00 CET". `.osc.gz` diffs are published and "kept for 100 days" ([technical](https://download.geofabrik.de/technical.html)). "No sub regions are defined for this region", so there is no Metro Manila or Luzon extract. The file has grown about 4% a year (566 MB on 2025-01-01, 588 MB on 2026-01-01; directory index on the same page).
- **Road network size** (whole country, [taginfo](https://taginfo.geofabrik.de/asia:philippines/keys/highway), data from 2026-11-01): 1,623,381 ways tagged `highway`. The largest classes are residential 719,811, service 328,363, track 116,087, unclassified 108,537, tertiary 62,182, secondary 29,222, primary 24,395, trunk 15,386 and motorway 2,938. `oneway` appears on 106,254 ways, and there are 6,851 `type=restriction` relations.
- **Tagging conventions.**
  - The PH road classification guideline was "drafted in 2019, and while not fully approved, most of the roads have since been tagged using these guidelines" ([classification](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_conventions/Roads/Classification)).
  - Its stated reason is to "avoid network connectivity issues that arose with previous mapping practice" ([roads](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_conventions/Roads)).
  - "For Metro Manila, the trunk routes are EDSA, MacArthur Highway, and Route 1 south of Alabang".
  - Motorways bar "bicycles, pedestrians, tricycles, non-motorized vehicles" (classification page).
  - The EDSA Busway is tagged `highway=busway` ([public transport](https://wiki.openstreetmap.org/wiki/Philippines/Public_transportation)).
- **Known gaps documented by primary sources** (only these):
  - Speed limits: "In most roads, there is typically no posted speed limit. These may be tagged … or none at all" ([roads](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_conventions/Roads)).
  - The roads page's "Access" section is empty, so there is no written PH convention for tricycle or jeepney access.
  - The motorway exception list "is incomplete as of 2022".
  - The [mapping status page](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_status) is stale. Its undated history says Metro Manila is "approaching around 90% of roads mapped".
  - We found no primary source that measures how complete `oneway` or turn-restriction tagging is. Whether 6.9k restrictions nationwide is too few is [INFERENCE] and unverified.
- **Effect on street paths** [INFERENCE]. Car profiles route on `highway`, `oneway`, access and turn restrictions. Missing restrictions produce legal-looking but wrong turns, and missing speeds fall back to each profile's per-class defaults. None of the engines models jeepney routes; the brief already accepts "not jeepney-accurate".

## Licensing of stored route geometry

- **Engine licenses** (from the engine table). OSRM, Valhalla and GraphHopper are permissive. ORS is GPL-3.0 [INFERENCE: GPL obligations attach to distribution, so running ORS behind our proxy does not oblige us to publish our app's source].
- **OSM data.** The OSMF [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) say: "Routing engines that use OpenStreetMap data must credit OpenStreetMap. Applications that incorporate such a routing engine must credit OpenStreetMap". They add: "Routing instructions generated by such a routing engine need not maintain attribution attached to the instructions, as long as they do not form a Derivative Database".
  - Our maps already credit OSM for the tiles.
  - [INFERENCE] Storing one path per post or leg and drawing it on our map fits this.
  - [INFERENCE] A bulk export or public API of every stored path could count as a Derivative Database, because "we regard repeated small extractions as one big extraction!" ([Substantial guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)). ODbL share-alike would then apply. No OSMF ruling covers this exact case.
- **Provider terms on top of ODbL.**
  - ORS results are CC-BY-SA 4.0 and need the attribution "© openrouteservice by HeiGIT | Data from OpenStreetMap".
  - GraphHopper requires OSM attribution, and GraphHopper attribution unless the plan is white-label.
  - The FOSSGIS servers require OSM attribution plus a link to `openstreetmap.org/fixthemap`.
  - Geoapify requires OSM attribution, plus Geoapify attribution on the Free plan.
  - Mapbox requires "© Mapbox" and "© OpenStreetMap", and forbids merging with open-data-licensed data (Product Terms §1.13).

## Geometry: what each returns for storage

| | polyline6 | polyline5 | GeoJSON | Default simplification |
|---|---|---|---|---|
| OSRM | `geometries=polyline6` | default | `geometries=geojson` | **Yes**: `overview=simplified`; request `full` |
| Valhalla | native per-leg `shape` | `format=osrm&shape_format=polyline5` | `format=osrm&shape_format=geojson` | No |
| GraphHopper | `points_encoded_multiplier=1e6` | default | `points_encoded=false` | **Yes**: RDP, `way_point_max_distance=0.5` |
| ORS | No | JSON default | `/geojson` endpoint | No (`geometry_simplify` is off by default) |
| Mapbox / LocationIQ | `geometries=polyline6` | default | `geometries=geojson` | **Yes**: `overview=simplified` |
| Stadia | native | n/a | n/a ([OpenAPI](https://api.stadiamaps.com/openapi.yaml)) | No |
| Geoapify | `details=polyline6` | `details=polyline5` | default (MultiLineString per leg) | No parameter documented |

Size, for scale [MEASURED]. A 14.7 km Cubao → SM North → Quiapo car path has 432 points in OSRM's full geometry: 1,706 characters as polyline6, 1,173 as polyline5, and 10,750 bytes as a GeoJSON LineString. Whether to store full geometry, simplify it ourselves, or rely on a provider's simplification is a question for a later ticket.

## Measured on the Philippines extract

**Setup.** One workstation: 12 hardware threads, 14 GiB RAM, NVMe, Fedora 43, rootless Podman. Input was `philippines-261101.osm.pbf` (612,512,721 bytes, md5 `26169f597050805bcde8443418b27cbe`, which matches Geofabrik's `.md5`).

**Images.** `ghcr.io/project-osrm/osrm-backend` v26.11.0, `ghcr.io/valhalla/valhalla` 3.9.1-63e4d1aa6, GraphHopper `graphhopper-web-11.1.jar` on `eclipse-temurin:21-jre`, and `openrouteservice/openrouteservice:v10.1.0`. Each step ran alone, under GNU `time` (wall, peak RSS).

**Test route.** Pins at Cubao (121.0532, 14.6206) and Quiapo Church (120.9838, 14.5988), with a via near SM North EDSA (121.0306, 14.6566).

### OSRM (MLD, default profiles)

| Step | car: wall / peak RSS | foot: wall / peak RSS |
|---|---|---|
| `osrm-extract` | 172.5 s / 6.26 GiB | 138.0 s / 5.59 GiB |
| `osrm-partition` | 30.2 s / 1.80 GiB | 33.4 s / 2.02 GiB |
| `osrm-customize` | 6.6 s / 1.13 GiB | 5.6 s / 1.33 GiB |
| Output on disk | 1.88 GiB | 2.09 GiB |
| `osrm-routed` RSS after loading | 1.24 GiB | 1.31 GiB |

OSRM's own log agreed with GNU `time`: "RAM: peak bytes used: 6717767680" for the car extract.

Route results:

- A→B by car: 9.20 km, 1 leg.
- A→V→B with `waypoints=0;2`: 1 leg, 14.69 km, passing 52 m from the via.
- A→V→B without `waypoints`: 2 legs.
- A→B on foot: 8.50 km.

### Valhalla (no admins, timezones or elevation)

| Run | Wall | Result |
|---|---|---|
| `valhalla_build_tiles`, no cap | 143.3 s | OK; peak RSS 10.5 GiB, mostly memory-mapped temp files |
| Same, `--memory=4g` (swap 0) | 158.6 s | OK, identical 570 MiB tiles |
| Same, `--memory=2g` (swap 0) | — | Killed (exit 137), tiles incomplete |
| `valhalla_build_extract` (tar) | 1.5 s | 572 MiB tar |
| `valhalla_service` RSS after test queries | — | 0.09 GiB [INFERENCE: grows with its tile cache under real traffic] |

Route results:

- A→B: auto 9.0 km, pedestrian 8.6 km.
- A→V→B with the via as `through` or `via`: 1 leg, 14.74 km, passing 50 m from V.
- The same with `break`: 2 legs.
- 21 auto locations: HTTP 400, "Exceeded max locations: 20".

### GraphHopper (car with turn costs and CH, foot without CH)

| Step | Wall | Peak RSS | Output |
|---|---|---|---|
| `import` with `-Xmx6g` | 426.9 s, of which CH 342 s | 3.43 GiB | 481 MiB graph-cache |
| `server` with `-Xmx2g`, after test queries | — | 0.78 GiB | — |

Route results:

- A→B by car: 9.01 km.
- A→V→B: 14.73 km.
- `pass_through=true` with CH: HTTP 400, "currently not supported for speed mode".
- `pass_through=true` with `ch.disable=true`: OK.
- Foot without `ch.disable=true`: HTTP 400, "Cannot find CH preparation".
- Foot with it: 9.95 km.

### ORS

| Step | Wall | Peak RSS | Output |
|---|---|---|---|
| Graph build, `driving-car` + `foot-walking`, `XMX=4g`, `REBUILD_GRAPHS=True` | 770 s from container start to `ready` (car finished after 7.9 min, foot 4.8 min later) | 4.96 GiB (Java process) | 541 MiB car + 577 MiB foot |
| Serving after test queries | — | 4.3 GiB | — |

Route results:

- A→B by car: 9.09 km.
- A→V→B: 14.73 km, `way_points` `[0, 72, 296]`, so the via splits the route into 2 segments.
- A→B on foot: 9.64 km.
- `geometry_simplify=true` with the via: accepted, 113 points instead of 297.
- The first request with `instructions=true` took 4.0 s; the others took 14–204 ms.

### What the numbers mean [INFERENCE]

- At this extract size, any of the four engines rebuilds in minutes, so a daily or weekly rebuild against Geofabrik is cheap. Stored street paths don't change when the data does, because they are never re-routed.
- Preprocessing can run on a bigger machine than the server, with the outputs copied across. That matters most for OSRM, whose extract peaks above 6 GiB even though serving needs about 1.3 GiB per profile.
- Valhalla serves both profiles from one 570 MiB tile set with the smallest resident memory.
- Response times on this machine ranged from 7 ms to 254 ms per route, apart from that one 4.0 s ORS request. They include first-request warm-up. That is not a benchmark, but every engine is far below human editing speed.

## Open questions for later tickets

- Whether CommuteNity counts as commercial use. It decides the GraphHopper Free, Stadia Free and LocationIQ Free tiers, and the FOSSGIS "substantial part" clause.
- Whether to store full geometry or simplify it before storing, and at what precision (polyline6 vs GeoJSON).
- Where a self-hosted router would run, since the web app needs an always-on process beside it, and who keeps it updated.
- Whether to ask GraphHopper, Stadia or Mapbox for written terms that permit storage, if a hosted option is preferred.
- Unverified items:
  - the GraphHopper Free per-minute limit;
  - whether GraphHopper's per-plan location cap applies to `/route`;
  - the FOSSGIS service limits;
  - the current openrouteservice.org restrictions (only a 2025-12-28 Wayback capture was available);
  - whether Stadia's traffic covers the Philippines.
