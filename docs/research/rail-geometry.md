# Rail line geometry for MRT and LRT legs

Research for the street-paths map, ticket 10 ("Rail line geometry for MRT and LRT legs"). Researched 2026-11-04. This file records facts and options with a recommendation; **it does not decide**. [Which legs get a street path](https://github.com/geadlydrim/CommuteNity-Web/issues/5) already decided that an MRT or LRT leg follows the rail line between its two pins instead of a street path. This file answers where that geometry comes from and how the stretch between two pins is cut out of it.

How to read it:

- Claims link to the page or file that owns them: OSM wiki pages, OSMF and ODbL licence texts, Valhalla and OSRM source, the operator's own site.
- **[MEASURED]** marks a number from our own run on 2026-11-04. Two datasets were used: the Geofabrik Philippines extract `philippines-261102.osm.pbf` ("contains all OSM data up to 2026-11-02T21:21:26Z", [Geofabrik](https://download.geofabrik.de/asia/philippines.html)), read with pyosmium; and live Overpass (`timestamp_osm_base` 2026-11-04T00:30:11Z). Method and scripts' logic are in [Method](#method).
- **[INFERENCE]** marks a conclusion that no primary source states outright.
- Vocabulary follows `GLOSSARY.md`: a **leg** has a **mode** and two **pins**. The glossary reserves "Stop" for the parked catalog, so "station" below means a place on a rail line, as in the ticket.
- In the app, `mrt` and `lrt` are the only rail modes (`src/lib/schemas/modes.ts`). There is no PNR mode, so PNR and NSCR are reported only because the ticket asked.

## Short answer

1. **OSM maps all three operating lines completely enough to cut legs from.** MRT-3 (13 stations), LRT-1 (25) and LRT-2 (13) each have one route relation per direction, a gap-free chain of track ways per direction, and a `public_transport=stop_position` node on those ways for every station (one stop node is missing, see below) [MEASURED]. The station counts match what LRTA publishes for LRT-1 and LRT-2 ([LRTA](https://www.lrta.gov.ph/railway-operations/)). NSCR is not usable yet, and PNR's Metro Manila commuter service is partly tagged `abandoned` [MEASURED].
2. **Neither Valhalla nor OSRM routes on rail out of the box.** Valhalla's tile build only admits ways with `highway` or `route=ferry|shuttle_train`; its transit mode reads GTFS, not OSM rails. OSRM's stock profiles require `highway` or `route`. A rail profile would mean an extra OSRM dataset and server [INFERENCE: not tested].
3. **The geometry is tiny.** MRT-3 and LRT-2 in both directions plus LRT-1 in one direction, with the 76 stop nodes of those five relations, are 32.7 KB as GeoJSON, 8.0 KB gzipped [MEASURED]. That makes a checked-in file or a stored lookup table practical. Runtime calls to Overpass are not: the two public instances that answered took 19–40 s, and two others did not answer at all [MEASURED].
4. **Recommendation (not a decision):** generate one small ODbL-labelled data file from the Geofabrik extract the router already needs, commit it, and cut legs from it with a pure function that snaps each pin to the nearest station of the leg's mode and falls back to the straight line when no station is near. See [Recommendation](#recommendation).

## How the lines are mapped in OSM

### Conventions on the wiki

- The Philippine public-transport page tells mappers to follow the PTv2 scheme and to tag route relations `route=train` for PNR, **`route=subway` for LRT Line 2** (and the future MRT-7, Makati Intra-City Subway and Metro Manila Subway), and **`route=light_rail` for LRT Line 1 and MRT Line 3**. Rail `network` is "usually the name of the system a route belongs to (e.g. Philippine National Railways, Manila LRT)" ([Philippines/Public transportation](https://wiki.openstreetmap.org/wiki/Philippines/Public_transportation)).
- That page links a train-routes subpage, `Philippines/Public_transportation/Train`. It returned HTTP 404 on 2026-11-04 [MEASURED], so there is no written PH convention beyond the table above.
- Track ways: `railway=subway` is "Rails used for city public transport that are always completely separated from other traffic, often underground", and "some subway lines may run entirely above the ground" ([railway=subway](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dsubway)). `railway=light_rail` is used "inconsistently across the world" ([railway=light_rail](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dlight_rail)). So the way tag cannot be derived from the mode; it has to be read off the data.
- Stations: `public_transport=stop_position` marks the node on the rails where the vehicle stops; it "can be used for any transport mode" ([stop_position](https://wiki.openstreetmap.org/wiki/Tag:public_transport%3Dstop_position)). `railway=stop` is the rail-specific tag for "the spot on a railway track where a train stops at a station" and "should be added to a node on a railway way in order to facilitate routing software" ([railway=stop](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dstop)). A `type=public_transport` + `public_transport=stop_area` relation groups the station area and its stops ([Public transport](https://wiki.openstreetmap.org/wiki/Public_transport)). A `route_master` relation groups the two directions ([Relation:route_master](https://wiki.openstreetmap.org/wiki/Relation:route_master)).

### What the extract holds [MEASURED]

Extract `philippines-261102.osm.pbf` (2026-11-02). The Geofabrik file carries no user names or IDs, which this work does not need.

| | MRT-3 | LRT-1 | LRT-2 |
|---|---|---|---|
| Route relations | `109159` North Avenue → Taft Avenue (v90, edited 2026-07-22); `8000253` Taft Avenue → North Avenue (v40, 2026-10-03). `route=light_rail` | `8000260` Dr. Santos → Fernando Poe Jr. (v42, 2026-08-08); `110418` Fernando Poe Jr. → Dr. Santos (v80, 2026-08-01). `route=light_rail`. Two short variants, `10463194` / `10463195` (Monumento ↔ Dr. Santos, 23 / 15 stops), also exist | `110410` Antipolo → Recto (v96); `8000264` Recto → Antipolo (v50), both edited 2026-07-22. **`route=subway`** |
| `route_master` | `8000255`, ref 3, network "Manila MRT", 2 members | `8000262`, ref 1, network "Manila LRT", 6 members | `8000265`, ref 2, network "Manila LRT", 2 members |
| Track ways | `railway=light_rail`, 89 unique ways over both directions; 57 `bridge=viaduct`; `gauge=1435`, `electrified=contact_line`; one chain per direction (only 1 way shared) | 36 `railway=light_rail` ways over the four relations, all `bridge=viaduct`, plus 2 `railway=construction` ways that appear only in `110418`; roles `inactive` on 3 members of `110418` and 2 of `8000260` | **`railway=subway`**, 36 ways over both directions; 30 `bridge=viaduct`, 2 `tunnel=yes`. A query for `railway=light_rail` would miss this line |
| Chain of track ways in one relation | 1 component, no gaps, 47 / 43 ways, 16.91 / 16.92 km | 1 component, no gaps, 16 ways, 24.71 km (`8000260`, the full Dr. Santos → Fernando Poe Jr. relation) | 1 component, no gaps, 18 / 18 ways, 16.63 / 16.54 km |
| Stations in the relation (`stop` members) | 13 in `109159`; **12 in `8000253`** (no Taft Avenue stop node; only a platform way) | 25 in both full relations | 13 in both |
| Operator's published count | "13 stations" [INFERENCE: the sources found are secondary, e.g. [Expressway.PH](https://www.expressway.ph/transit/mrt-line-guide)] | "25 active stations" ([LRTA](https://www.lrta.gov.ph/railway-operations/)) | "13 stations", 17.6 km, Antipolo to Recto ([LRTA](https://www.lrta.gov.ph/railway-operations/)). The OSM chain is 16.6 km; the 1 km gap is not explained by the data |
| Stop members that are nodes of a member track way | 13 / 13 in `109159`; 12 / 12 in `8000253` | 25 / 25 in both full relations | 13 / 13 in both |
| Distinct stop nodes inside a `stop_area` relation | 25 / 25 | 50 / 50 | 26 / 26 |

Other facts from the same run:

- **Each direction is its own track.** The two chains per line are parallel. For MRT-3 the median distance from a vertex of one chain to the opposite chain is 3.8 m (p90 7.1 m, max 17.8 m); for LRT-2 3.9 m (p90 6.9 m, max 98.5 m, likely where the tracks diverge near Katipunan [INFERENCE]). At map zoom for a leg thumbnail the two are indistinguishable, so one direction's chain can stand for the leg.
- **Stop positions are per direction, and sometimes far apart.** The two stop nodes of a station are a median 5 m apart, but up to 202 m (MRT-3 Boni) and 126 m (MRT-3 Ayala, Buendia, North Avenue). So a station is not one point; a pin snaps to a station, and the leg then uses whichever direction's node.
- **The relation order is clean.** Walking each chain and reading the chainage of each `stop` member gave strictly increasing values for every full-line relation (inter-station spacing: MRT-3 751–2,364 m; LRT-2 923–2,284 m; LRT-1 561–2,419 m), so "slice between two stop nodes" is well-defined.
- **Station names are not reliable keys.** The two UN Avenue stop nodes (`5191404483`, `10053766604`) carry `name=/` (the `name:ja`, `name:zh` etc. values are present). The LRT-1 `stop_area` for Fernando Poe Jr. is named "Roosevelt" (the station's former name, [LRTA](https://www.lrta.gov.ph/railway-operations/)). Keys should be OSM IDs or refs, not `name`.
- **Searching by tag over-collects.** The extract has 14 `route=train`, 31 `route=railway` and 1 `route=tram` relations. Among them are dozens of PNR and Bicol relations, MRT-7 (`SMC-MRT7`, `route=railway`, `subway` and `proposed` ways), and the Metro Manila Subway (`MRT-9`, `route=train`, ways `construction` and `subway`; per direction relation, two `stop` members and one station member were not tagged as stop or station nodes in my pass). Eleven stations tagged `network=Manila MRT`, `station=subway` (e.g. Batasan, Sacred Heart) are on the unbuilt MRT-7 [INFERENCE: from the names]. Selecting by `route_master` ID or by `ref` plus `network` avoids this.
- **A stale pair exists.** `15571426` / `15571427` "LRT Line 2: Cogeo → Antipolo" (2023, v1) has only `proposed` ways, and its three stop members were not tagged as stop or station nodes in my pass.

### PNR and NSCR [MEASURED]

- **NSCR:** `11085992` Tutuban → Malolos and `12517939` Malolos → Tutuban (`route=railway`, `ref=NSCR`, 2026-03-14) have no stop members, and their ways are `proposed` (11) and `construction` (6). `12517939` is in two disconnected pieces. Not usable as an operating line.
- **PNR Metro North Commuter** (`9165727` / `9165728`, Tutuban ↔ Governor Pascual, 6.6 km, 6 stations): 6 of 15 member track ways are `railway=rail`, **9 are `railway=abandoned`**. The **PNR Shuttle Service** relations (`8545505`, `10015475`) are mostly `abandoned` too (33 of 40 and 31 of 39 member ways). A slicing function that only accepts active railway values would drop most of PNR; one that accepts `abandoned` gives a line the data itself says is not in use. Whether this is a tagging lag or reality is not answered by the data [INFERENCE].
- The app has no PNR mode, so this matters only if a train mode is added.

### Freshness [MEASURED]

The newest edits among the MRT-3, LRT-1 and LRT-2 relations are 2026-07-22 to 2026-10-03. The extract was one day behind when downloaded ("contains all OSM data up to 2026-11-02T21:21:26Z", [Geofabrik](https://download.geofabrik.de/asia/philippines.html)). A live Overpass query two days later returned the same six relations with the same names. [INFERENCE] Lines this stable change rarely; the events that change them are an extension opening (the LRT-1 Cavite Extension Phase 1 opened 2024-11-16 per [LRTA](https://www.lrta.gov.ph/railway-operations/), and Phase 2 is still under construction) or an OSM edit war.

## Can a shortlisted router route on rail?

| Engine | Finding | Source |
|---|---|---|
| Valhalla | The Lua way filter keeps a way only if `route=ferry`, `route=shuttle_train` or it has a `highway` tag (`if (ferry == true or rail == true or kv["highway"])`, where `rail` is `route == "shuttle_train"`). A `railway=light_rail` or `railway=subway` way has none of these, so it never enters the graph. The costing models are `auto`, `bicycle`, `bus`, `taxi`, `truck`, `pedestrian`, scooters and `multimodal`; none routes on rails over OSM. `multimodal` "currently supports pedestrian and transit", and the transit tiles come from a program that "converts a directory of transit feeds into protobuf tiles" (it "reads GTFS data"). | [`lua/graph.lua`](https://github.com/valhalla/valhalla/blob/master/lua/graph.lua) lines 941–948; [route API](https://valhalla.github.io/valhalla/api/route/api-reference/); [`valhalla_ingest_transit.cc`](https://github.com/valhalla/valhalla/blob/master/src/mjolnir/valhalla_ingest_transit.cc), [`ingest_transit.cc`](https://github.com/valhalla/valhalla/blob/master/src/mjolnir/ingest_transit.cc) (uses `just_gtfs`) |
| OSRM | Stock `car.lua` returns early unless the way has `highway` or `route`; `foot.lua` prefetches `railway` but only gives `railway=platform` a speed. Profiles are Lua scripts: "You can easily modify these or create new ones if you like". They are applied at extract time, so after changing one "you will need to extract, contract and reload the data again". One processed dataset serves one profile. | [`profiles/car.lua`](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua) lines 450–466; [`profiles/foot.lua`](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/foot.lua); [profiles.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/profiles.md) |

So: **a separate geometry source is needed** for Valhalla. For OSRM, a custom `rail.lua` profile accepting `railway=light_rail|subway` is possible [INFERENCE: not built or tested here] but costs a third dataset next to car and foot ([routing-engines research](https://github.com/geadlydrim/CommuteNity-Web/blob/research/routing-engines/docs/research/routing-engines.md): about 3–3.5 min and 5.6–6.3 GiB peak RAM to preprocess one OSRM profile of the same extract). Even then the engine would snap pins to the nearest track point, not to stations, and has no notion of which line to take where lines run close.

## Ways to obtain the line geometry

Sizes and timings are [MEASURED] unless stated.

| Option | What it is | Freshness | Runtime dependency | Notes |
|---|---|---|---|---|
| **A. One-off extract, checked in** | Run a script once against the Geofabrik PBF or Overpass; commit the result (GeoJSON or a TS module): per line, the track as one polyline, and per station the stop-position coordinates and chainage. | Frozen until someone re-runs it. | None. | 5 directional lines plus 76 stop-node points: 32.7 KB JSON, 8.0 KB gzip. A single full-line leg is 4.2 KB (MRT-3), 4.2 KB (LRT-2) or 7.1 KB (LRT-1) as `[lon,lat]` JSON at 6 decimals, or 0.85 / 0.85 / 1.3 KB as an encoded polyline. |
| **B. Periodic Overpass query** | A scheduled job (cron, CI) runs the Overpass query below and rewrites the file or a table. | As fresh as the schedule. | Overpass at refresh time only. | One query for the six relations with `out geom` returned 137 KB in 19 s (`maps.mail.ru` instance) or 40 s (`overpass-api.de`). Two other instances returned nothing within 90 s. See [Overpass availability](#overpass-availability). |
| **C. Derive from the Geofabrik extract the router already uses** | The same script as A, fed with the PBF that Valhalla or OSRM is built from: `osmium getid -r` with the relation IDs adds every referenced way and node ([osmium getid](https://docs.osmcode.org/osmium/latest/osmium-getid.html)); or read it with pyosmium, as done here. | Equal to the age of the extract the router is built from (the one used here was one day old). | None extra: the PBF is already on the build machine. | The PBF is 612,601,301 bytes. Reading it once to collect rail objects took about 15 s with pyosmium. One input, so line geometry and street paths cannot drift apart in date. |
| **D. Live Overpass query at request time** | The server calls Overpass for each rail leg. | Live. | Overpass on the hot path. | The builder routes on each pin move; a 19–40 s upstream call, a usage policy of 10,000 queries/day, and the measured outages rule this out [INFERENCE: not an ADR 0003 violation if proxied, but unusable]. |
| **E. Let the router do it** | Valhalla (not possible, see above) or OSRM with a rail profile (possible, untested). | Router rebuild. | A third OSRM dataset and process. | Snaps to the nearest track point rather than to a station; no way to pin the result to a line. |

A, B and C are three ways to produce the same file; they differ in who runs the script and how often. A one-time C followed by a manual refresh when a station opens is the lightest; B adds automation.

The Overpass query that fetched the six relations (also the shape of what C reads from the PBF):

```
[out:json][timeout:60];
relation(id:109159,8000253,110410,8000264,110418,8000260);
out geom;
```

The `out geom` form returns each member way's coordinates in member order, which is the order the chain-building above relied on. [INFERENCE] `out geom` on relations also returns member node positions, so the stop positions come out of the same call; it was not separately parsed here.

### Overpass availability [MEASURED]

- Without a `User-Agent`, `overpass-api.de/api/status` returned 406; a status call with one got no reply within 20 s. Its `interpreter` returned `502 Gateway Timeout ... at capacity` once, then 200 (the 40 s call).
- `maps.mail.ru/osm/tools/overpass` answered 200 in 19 s; a first, larger query returned 504, and a later `type=route_master` query returned a non-JSON reply after 54 s.
- `overpass.private.coffee` and `overpass.kumi.systems` returned an empty body or no reply within 90 s.
- The OSM wiki says the free public servers "are designed for small projects and can often become overloaded", suggests deploying your own server or to "download the regional dumps [from Geofabrik] and filter it using osmium", and gives the main instance's fair-use bar: "less than 10,000 queries per day and download less than 1 GB data per day and in sum your requests are processed in no more than 10 minutes", with a `User-Agent` or `Referer` that identifies the app ([Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API); [commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)).

## Licensing (ODbL) for each option

- **The data is ODbL for every option.** Geofabrik: "Data processed by Geofabrik GmbH and created by OpenStreetMap Contributors | License: ODbL 1.0" ([Geofabrik](https://download.geofabrik.de/asia/philippines.html)); Overpass responses carry "The data is made available under ODbL."
- **What ODbL asks.** A Produced Work needs a notice only when "Publicly Used", of the form "Contains information from DATABASE NAME, which is made available here under the Open Database License (ODbL)" (§4.3, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)). A Derivative Database that is Publicly Used must stay under ODbL (§4.4) and a copy or the method of making it must be offered (§4.6); a Produced Work does not become a Derivative Database (§4.5b). "If the published result of your project is intended for the extraction of the original data, then it is a database and not a Produced Work" ([Produced Work guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline)).
- **Substantial.** Insubstantial means fewer than 100 "Features" (a way or an independent node; "A node within a Way is not considered to be a feature"), one-off, and "repeated small extractions" count as one big one ([Substantial guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline)). The MRT-3, LRT-1 and LRT-2 track ways alone are 89 + 38 + 36 = 163 ways [MEASURED], plus station nodes, which is over the threshold.
- **Attribution already exists in the app.** Every map canvas renders an OSM attribution: `OsmAttribution` in `src/components/map/static-tile-canvas.tsx` and the MapLibre attribution control from the raster source (`src/components/map/map-view.tsx`, `osm-style.ts`). That satisfies the §4.3 notice for a drawn line.

| Option | Licence consequence [INFERENCE unless cited] |
|---|---|
| A / B / C (file in the repo) | The repository is public (GitHub reports `PUBLIC`). A committed file extracted from >100 features is a database taken from OSM and published; treat it as ODbL: put it in its own directory with a notice and a link to the licence, and credit OpenStreetMap contributors. The OSMF Community Guidelines say that "so long as a particular data type within a database consists entirely of non-OSM data within a regional cut, the OSM and non-OSM datasets will be considered 'independent'" and so form a Collective Database ([Community Guidelines](https://osmfoundation.org/wiki/Licence/Community_Guidelines)); the rail file is separate OSM-only data next to our non-OSM data, so the rest of the repo is unaffected. If the file is only built into the deployed bundle and not committed, the notice is the same. |
| Slices stored in `map_data` | Each guide stores one slice per rail leg, drawn on the map. That is a Produced Work shown with attribution. A bulk export of every slice could be argued to be a Derivative Database; the OSMF's routing safe harbour says routing output "need not maintain attribution attached to the instructions, as long as they do not form a Derivative Database" ([Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)), and notes "detailed guidelines do not exist". The same argument applies to stored street paths in the [routing-engines research](https://github.com/geadlydrim/CommuteNity-Web/blob/research/routing-engines/docs/research/routing-engines.md), so it is not new to rail. |
| D (live Overpass) | Same ODbL. Overpass's public instances add their own usage policy (above). |

## Cutting the stretch between two pins

Inputs: the leg's mode (`mrt` or `lrt`) and two pins (lat/lng). Output: a polyline along the rail, or "no rail path".

Measured building blocks (all [MEASURED]):

- **One chain per line is enough.** A per-direction relation's ways chain end to end with no gaps for MRT-3, LRT-1 and LRT-2, so a slice is a contiguous run of vertices between two chainage values. To keep the leg in travel direction, either pick the relation whose direction matches pin A → pin B or reverse the slice; the opposite track is a median 4 m away.
- **Station spacing bounds the snap radius.** The closest stations on one line are 561 m apart (LRT-1), so a snap radius under half of that, about 280 m, cannot confuse two stations of the same line.
- **Interchanges are the exception.** Stop positions on different lines are within 600 m at five places: LRT-1 EDSA ↔ MRT-3 Taft Avenue 203 m; LRT-1 Doroteo Jose ↔ LRT-2 Recto 220 m; LRT-2 Araneta Center-Cubao ↔ MRT-3 Cubao 355 m; LRT-1 Carriedo ↔ LRT-2 Recto 487 m; LRT-1 Baclaran ↔ MRT-3 Taft Avenue 490 m. Because the `lrt` mode covers both LRT-1 and LRT-2, a pin at Doroteo Jose or Recto must pick its line from the other pin.
- **Synthetic pin test.** For every one of the 51 stations, 16 pins on a circle of radius r around the station's mean stop position were snapped to the nearest station using distance to any of its stop nodes:

  | pin offset r | all three lines pooled | LRT-1 alone |
  |---|---|---|
  | 50 m | 100 % (816/816) | 100 % |
  | 100 m | 100 % | 100 % |
  | 150 m | 98 % (802/816) | 100 % |
  | 250 m | 96 % | 100 % |
  | 350 m | 92 % | 94 % |

  The misses at ≥150 m are probably pins pulled to a neighbouring line's station at the interchanges above [INFERENCE: the misses were not itemised]. The test is synthetic (real pins are not uniformly distributed) and only checks station identity.

### Options for the cut

| Option | How | Strengths | Weaknesses |
|---|---|---|---|
| **1. Snap to stations** | Find the nearest station (min distance over its stop nodes) among stations of the leg's mode, within radius R. Slice the chain between the two stop-position chainages. | Leg starts and ends exactly at a station; matches "where I got on and off". Robust to pins placed on the street beside the station entrance. Works with the gap-free chains above. | Fails if the pin is far from any station (R). Needs the interchange rule when the two nearest stations are on different lines. |
| **2. Project to the line** | Take the nearest point on the track polyline for each pin and slice between the two projections. | No station data needed beyond the track. | A pin near but not at a station ends mid-viaduct, 50–200 m from where passengers board. A pin near an interchange can snap to the wrong line. |
| **3. Snap to station, fall back to projection, then to the straight line** | Option 1 within R₁; else option 2 within R₂ of the track; else the straight line, as already decided when routing fails ("keep the straight line and still publish", [#2](https://github.com/geadlydrim/CommuteNity-Web/issues/2)). | Covers the three cases the ticket names: pin near a station, pin along the line, pin nowhere near it. | Two radii to choose, and a mid-line end is only as good as the author's pin. |

What to do when a pin is not near the line, from the data above:

- Radii: R₁ under about 280 m is unambiguous on one line (561 m minimum spacing); the synthetic test shows 98–100 % up to 150 m pooled across lines.
- If the two pins snap to **the same station**, there is no stretch to cut; use the straight line.
- If they snap to **stations on different lines**, there is no single line to follow; use the straight line (the transfer between lines belongs to the transfer, not the leg).
- If a pin snaps to nothing within the radius, use the straight line and draw nothing along the rail.
- For the `mrt` mode the data has one candidate line (MRT-3). MRT-7 and the Metro Manila Subway exist in OSM only as `proposed` or `construction` and have no operating geometry [MEASURED], so they must not be matched.

Where to run the cut [INFERENCE]: the cut is a pure function of two points and a ~8 KB gzipped file, so it can run in the builder with no network call, or in a server route; a server route is only needed if the file is not shipped to the browser. Storing the result as an encoded polyline keeps a full-line leg to 0.85–1.3 KB, against a `map_data` limit of 16 KB (`docs/codemap.md`); storing `[lon,lat]` JSON at 6 decimals puts one full-line LRT-1 leg at 7.1 KB, so two long rail legs in one guide would already use most of the cap. Whether the stored slice should be re-cut on display is the same "saved path is never recomputed on display" decision already made in [#2](https://github.com/geadlydrim/CommuteNity-Web/issues/2).

## Recommendation

Not a decision; this is what the evidence supports.

1. **Source: option C feeding option A.** Build the rail file from the Geofabrik extract that the router build already downloads, using a small script (osmium CLI or pyosmium) that selects the route relations by `route_master` or relation ID, never by tag, and writes a data file with: per line the chained track polyline of one direction, and per station the stop-position coordinates and chainage. Commit it, with an ODbL notice, in its own directory. Refresh by re-running the script when a station opens or a relation changes; option B (a scheduled run of the same script) is an easy later step. Do not call Overpass at request time.
2. **Do not route rail legs through Valhalla or OSRM.** Neither handles `railway=*` today, and a rail profile adds a dataset to maintain for a geometry that is 8 KB.
3. **Cut with option 3**, with R₁ near 250–300 m, a same-station or cross-line result falling back to the straight line, and the `lrt` mode choosing LRT-1 or LRT-2 from the pins.
4. **Store the slice as an encoded polyline** in `map_data`, bumping the version per ADR 0004, to stay far under the 16 KB cap.
5. **Guard against the OSM quirks measured above:** select ways by `railway=light_rail|subway` only after picking the relation (LRT-2 is `subway`); ignore `construction`, `proposed`, `inactive` members; key stations on node ID, not `name`; tolerate the missing Taft Avenue node in `8000253` by using the other direction's chain.

Open points not settled by this research:

- Whether stored slices are an ODbL Derivative Database in aggregate (no OSMF ruling covers it; it applies equally to stored street paths).
- The exact snap radius; it depends on how the pin picker lets authors place pins (not examined).
- The operator-published length of MRT-3 (only secondary sources found) and the gap between the LRTA's two LRT-1 length figures (20.1 km and about 26 km on [one page](https://www.lrta.gov.ph/railway-operations/)) against OSM's 24.7 km chain.
- A rail mode for PNR, which has no `TRANSPORT_MODES` entry today.

## Method

- Downloaded `https://download.geofabrik.de/asia/philippines-261102.osm.pbf` (612,601,301 bytes). Read it with pyosmium (`FileProcessor` with node locations and a `KeyFilter` on `railway`, `route`, `public_transport`, ...) to collect rail-related ways, stop and station nodes, and route / stop-area relations. Route relations kept: `route` in `train|subway|light_rail|tram|monorail|railway`. A second pass read `route_master` relations. The analysis chained member ways by shared end nodes, computed lengths with the haversine formula, and compared each stop node's chainage to its neighbours'.
- For the opposite-track distance, shapely was used after an equirectangular projection (accurate to a few percent at 14.6°N).
- Overpass: one query per instance (shown above) with an identifying `User-Agent`. The live relation names matched the extract.
- Wiki pages were read as raw wikitext (`action=raw`). Valhalla and OSRM files were read from `master` on 2026-11-04.
- The extract and scratch files were deleted afterwards. The analysis scripts were throwaway and are not in the repo, so the numbers can be reproduced only by repeating the steps in the first bullet.

## Sources

- OSM wiki: [Philippines/Public transportation](https://wiki.openstreetmap.org/wiki/Philippines/Public_transportation), [railway=subway](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dsubway), [railway=light_rail](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dlight_rail), [railway=stop](https://wiki.openstreetmap.org/wiki/Tag:railway%3Dstop), [public_transport=stop_position](https://wiki.openstreetmap.org/wiki/Tag:public_transport%3Dstop_position), [Public transport](https://wiki.openstreetmap.org/wiki/Public_transport), [Relation:route](https://wiki.openstreetmap.org/wiki/Relation:route), [Relation:route_master](https://wiki.openstreetmap.org/wiki/Relation:route_master), [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- Overpass: [commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- Geofabrik: [Philippines extract page](https://download.geofabrik.de/asia/philippines.html)
- Tools: [osmium getid](https://docs.osmcode.org/osmium/latest/osmium-getid.html), [osmium tags-filter](https://docs.osmcode.org/osmium/latest/osmium-tags-filter.html), [pyosmium](https://docs.osmcode.org/pyosmium/latest/)
- Licence: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), OSMF [Substantial](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline), [Produced Work](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline), [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), [Community Guidelines](https://osmfoundation.org/wiki/Licence/Community_Guidelines)
- Routing engines: Valhalla [`lua/graph.lua`](https://github.com/valhalla/valhalla/blob/master/lua/graph.lua), [route API](https://valhalla.github.io/valhalla/api/route/api-reference/), [`valhalla_ingest_transit.cc`](https://github.com/valhalla/valhalla/blob/master/src/mjolnir/valhalla_ingest_transit.cc); OSRM [`car.lua`](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua), [`foot.lua`](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/foot.lua), [profiles.md](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/profiles.md)
- Operator: [LRTA railway operations](https://www.lrta.gov.ph/railway-operations/). MRT-3 station count: secondary only ([Expressway.PH](https://www.expressway.ph/transit/mrt-line-guide)).
