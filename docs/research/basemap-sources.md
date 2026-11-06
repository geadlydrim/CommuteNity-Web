# Vector tile sources for a Philippines base map

Research for ticket 33 of the "Calmer base map" map ("Vector tile sources for a Philippines base map"). Researched 2026-11-06. This file records facts and options with a recommendation; **it does not decide**. It compares three ways of getting vector tiles for the Philippines **base map**: OpenFreeMap (hosted), the Protomaps basemap (extracted from their daily build, or built by us), and a self-built Planetiler tileset (OpenMapTiles profile) from the Geofabrik extract the router already downloads. Styling, hosting, and thumbnail rendering belong to sibling tickets; this file only touches them where the tile source forces a constraint.

How to read it:

- Claims link to the page, file, or licence text that owns them. Licence readings are plain reading of the texts, not legal advice; the OSMF says the same of its own FAQ ([Licence and Legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ)).
- **[MEASURED]** marks a number from a run on the owner's workstation on 2026-11-06 (12 cores, 14 GB RAM, other services running). **[INFERENCE]** marks a conclusion no primary source states outright.
- Measured inputs: the Geofabrik extract `philippines-261102.osm.pbf` (612 MB, data up to 2026-11-02, the file `scripts/router/download.sh` fetches); the Protomaps daily build `20261105.pmtiles` (version 4.15.2, [builds list](https://build-metadata.protomaps.dev/builds.json)); the OpenFreeMap planet run `20261101_080013_pt`. Tools: `pmtiles` CLI 1.31.2, Planetiler 0.10.2 (official container image), pyosmium.
- **What was not measured.** The Planetiler OpenMapTiles build was stopped at about 10 minutes (about half of the tile-writing phase) to free workstation memory, so it has no final time or size. The Protomaps-profile build image was built but never run. Both are marked "not measured: build stopped to free memory on the workstation". Separately, `osmdata.openstreetmap.de`, where both profiles fetch ocean/land polygons, was unreachable from the workstation ("No route to host", see [Self-built](#c-self-built-with-planetiler)).
- Vocabulary follows `GLOSSARY.md` (base map, pin, street path, station, focus view). Counts of "features" below are features **per tile**, summed over the tiles covering Metro Manila (lng 120.90–121.15, lat 14.35–14.80), so a feature crossing a tile edge counts in each tile. They show what a style can draw, not how many places exist.

## Short answer

1. **All three routes are viable; they differ in who builds the tiles, not in what the data is.** All three are OpenStreetMap data cut into Mapbox Vector Tiles. Two use the OpenMapTiles schema (OpenFreeMap, a Planetiler OMT build); Protomaps uses its own Tilezen-derived schema. A Philippines `.pmtiles` is **0.52 GB** (OpenFreeMap, z0–14) or **0.32 GB / 0.76 GB** (Protomaps, z0–14 / z0–15) when cut with `pmtiles extract` [MEASURED]. Each can be downloaded in 1–2.5 minutes with under 100 MB of RAM [MEASURED].
2. **Hosted OpenFreeMap tiles are free and keyless but come with no guarantee, and its terms forbid automated collection.** There are no limits on views or requests, no key, and the service "may discontinue … at any time without notice" ([README](https://github.com/hyperknot/openfreemap), [Terms](https://openfreemap.org/tos/)). The terms bar "collect[ing] data … in automated ways", except offline downloads of at most 3,000 tiles or 50 MB. Whether `/api/tiles` may sit in front of it is not stated; the safe reading is no. OpenFreeMap also publishes weekly planet `.pmtiles` for self-hosting, which sidesteps the question.
3. **The Protomaps basemap is the one that documents a build and a cut for the Philippines, and the one with grey/light/dark themes.** It offers a daily planet build to extract from ([downloads](https://docs.protomaps.com/basemaps/downloads)), a Planetiler profile with an official Dockerfile ([build](https://docs.protomaps.com/basemaps/build)), and five flavors: `light`, `dark`, `white`, `grayscale`, `black` ([flavors](https://docs.protomaps.com/basemaps/flavors)). Its tiles reach **z15** with individual buildings only at z15.
4. **For the ticket's feature list, the data is there in both schemas, with different gaps.** Roads by class, buildings, water, parks, and city names exist everywhere [MEASURED]. Landmarks (mall, market, church, school, hospital, bus terminal, rail station) exist in both but are mostly **z13–z14 features**; OpenMapTiles puts almost all POIs at z14 only, Protomaps puts the ranked ones from z12. **Barangay names are place points (`neighbourhood`, `quarter`), not boundary labels, in both schemas.** Barangay boundary lines exist only in OpenMapTiles (admin level 10, from z12). Protomaps stops at level 8 [MEASURED].
5. **ODbL: a hosted tile file is most likely a Produced Work, and the cost is a notice plus an offer to share the data on request.** Attribution ("© OpenStreetMap", plus "© OpenMapTiles" for OMT-schema tiles) is the visible duty. The share-alike duty attaches to a *Derivative Database*, and the OSMF guideline calls a published result "intended for the extraction of the original data" a database, which a downloadable vector tile file could be argued to be. A short "map data" page naming the source extract, the build recipe, and the file under ODbL meets either reading cheaply.
6. **Monthly upkeep is smallest for an extract (one command, minutes) and largest for a self-build (Java container, tens of minutes, plus a fragile download host).** Self-building is the only route that uses the same Geofabrik extract as the router and rail file. Extracting from Protomaps or OpenFreeMap gives fresher but different-dated data [INFERENCE: dates compared below].

## Comparison at a glance

| | OpenFreeMap (hosted) | OpenFreeMap (self-hosted from its weekly PMTiles) | Protomaps basemap (extract) | Protomaps profile (own build) | Planetiler OMT (own build) |
|---|---|---|---|---|---|
| Schema | OpenMapTiles | OpenMapTiles | Protomaps v4 (Tilezen-derived) | Protomaps v4 | OpenMapTiles |
| PH file size | none to hold | 99 MB z12, 201 MB z13, **519 MB z14** [MEASURED] | 81 MB z12, 166 MB z13, **322 MB z14**, **763 MB z15** [MEASURED] | not measured | not measured (stopped) |
| Max zoom (overzoom) | 14; MapLibre overzooms | 14 | 15; overzooms | 15 by default (`--maxzoom`) | 14 by default; Planetiler accepts up to 16 |
| Ocean/land polygons | included | included | included | needs `osmdata.openstreetmap.de` | needs `osmdata.openstreetmap.de` |
| Data date | planet run weekly, `20261101` | same | daily planet, replication time 2026-11-05T04:00Z | your extract (Geofabrik: 2026-11-02) | your extract |
| Themes shipped | Positron, Bright, Liberty, Dark, Fiord | same | light, dark, white, grayscale, black | same | none (community OMT styles) |
| Glyphs / sprites | hosted by OpenFreeMap | self-host from its assets bucket | GitHub Pages, or ZIPs to self-host | same | you provide |
| Tile-schema credit | "© OpenMapTiles" + OSM | same | OSM (Protomaps credit optional) | same | "© OpenMapTiles" + OSM |
| Monthly effort | none (their schedule) | one extract | one extract | Java container run | Java container run |

## A. OpenFreeMap

### Terms, limits, reliability

- **Free, no key.** "Using our public instance is completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies. We aim to cover the running costs … through donations" ([README](https://github.com/hyperknot/openfreemap)).
- **No guarantee.** The Terms of Service (last updated 2026-10-14) call it "a completely free service provided 'as-is,' with no warranties", say the operator "may discontinue [the Site] at any time without notice", and name Hyperknot Software Kft. (Hungary) as the party ([Terms](https://openfreemap.org/tos/)). The README says it has been MapHub's production base map since June 2024 and runs 2 serving hosts in round-robin DNS plus a Cloudflare R2 bucket ([README](https://github.com/hyperknot/openfreemap)).
- **No automated collection.** The conduct clause forbids "Collect[ing] data from the service in automated ways, except for offline downloads", defined as at most 3,000 tiles or 50 MB per download, at most 4 parallel requests, and a unique User-Agent ([Terms](https://openfreemap.org/tos/)). It says nothing about proxies or caches. A shared caching proxy such as today's `/api/tiles` fetches tiles on riders' behalf rather than harvesting them, but a cache-warming job or a bulk tile pre-fetch would breach the clause [INFERENCE]. The operator's address (`info@openfreemap.org`) is the place to ask.
- **Caching headers.** A tile under `/planet/latest/...` came back with `cache-control: max-age=86400` via Cloudflare [MEASURED, 2026-11-06]. The README says TileJSON for `/planet/latest` may be cached up to 1 hour and its tiles up to 1 day, while versioned URLs "are cached long term". A new weekly version changes the tile URLs ([README FAQ](https://github.com/hyperknot/openfreemap)).
- **No SLA, no CDN contract.** The README's own list of what the project does not provide includes static image generation, so thumbnails (ADR 0005) could not come from it either.

### Schema and update cadence

- **OpenMapTiles schema**, built with Planetiler from the OSM planet, Natural Earth, and Wikidata ([README](https://github.com/hyperknot/openfreemap)). The TileJSON at `https://tiles.openfreemap.org/planet/latest` lists 16 layers: `aerodrome_label`, `aeroway`, `boundary`, `building`, `housenumber`, `landcover`, `landuse`, `mountain_peak`, `park`, `place`, `poi`, `transportation`, `transportation_name`, `water`, `water_name`, `waterway`; `maxzoom` 14, version run `20261101_080013_pt` [MEASURED].
- **Weekly planet build**: Sunday 08:00 UTC build, deployed on Tuesday; the observed full-planet run on 2026-05-26 took 15 h 19 min, of which Planetiler took 5 h 22 min ([release cadence](https://github.com/hyperknot/openfreemap/blob/main/docs/tilegen_release_cadence.md)). The planet `.pmtiles` is about 90 GB; `https://btrfs.openfreemap.com/areas/planet/<run>/tiles.pmtiles` was 87.35 GB for `20261101_080013_pt` [MEASURED via HTTP HEAD]. The last 4 runs and the first run of each of the last 6 months are kept ([release cadence](https://github.com/hyperknot/openfreemap/blob/main/docs/tilegen_release_cadence.md)).
- **Max zoom 14, overzoom beyond.** MapLibre overzooms a source past its `maxzoom`; OMT tiles carry geometry detailed enough for that ("simplify tolerance at max zoom" is 0.0625 px in Planetiler's defaults) [MEASURED from the Planetiler argument log].

### Glyphs, sprites, themes

- Style JSON, glyphs, and sprites are all on `tiles.openfreemap.org`: `glyphs: https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`, `sprite: https://tiles.openfreemap.org/sprites/ofm_f384/ofm` (same in Positron, Liberty, Dark) [MEASURED from the style JSON]. Font files carry `cache-control: max-age=604800`. The assets bucket (`assets.openfreemap.com`: `fonts`, `sprites`, `styles`, `natural_earth`) is public, so fonts and sprites can be copied to our own storage.
- The fonts are Noto Sans (SIL OFL 1.1) and the POI icons Maki (CC0) ([LICENSE](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md)).
- Styles are forks of the abandoned OpenMapTiles styles. **Positron** (light, "special clean looking") has POIs removed; **Dark** and **Fiord** are "not yet complete … exactly as they are on their source repo" apart from fonts ([styles repo](https://github.com/hyperknot/openfreemap-styles)). The README's future plan lists a move to the Shortbread schema, so OMT is not a permanent promise [INFERENCE: it says "Migrate to Shortbread schema … Future"].

### Licence and attribution

- Required attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". "You do not need to display the OpenFreeMap part"; MapLibre adds the string automatically from the TileJSON ([README](https://github.com/hyperknot/openfreemap)). The tile schema's own licence is below.

## B. Protomaps basemap

### What it is

- "A general purpose vector base map … available as a single PMTiles archive, distributed as an Open Database License Produced Work (OpenStreetMap attribution required)." A planet file is "roughly 120 gigabytes, including zoom levels from 0 to 15" ([downloads](https://docs.protomaps.com/basemaps/downloads)); the 2026-11-05 build was 139.3 GB [MEASURED from the builds list]. The daily channel keeps all builds of the last week and the latest build of each patch version; hotlinking the downloads is discouraged ("copy the tileset to your own Cloud Storage").
- **Extract, measured.** `pmtiles extract https://build.protomaps.com/20261105.pmtiles out.pmtiles --bbox=116,4,127,21 [--maxzoom=N]`, with 4 download threads, over the ticket's box. The box also takes in parts of neighbouring countries and seas, so a clipped build would be smaller [INFERENCE: not measured].

  | Max zoom | Size | Wall time | Peak RSS | Transferred |
  |---|---|---|---|---|
  | z12 | 81.0 MB | 17.7 s | 55 MB | 85 MB |
  | z13 | 166.3 MB | 32.1 s | 57 MB | not recorded |
  | z14 | 322.5 MB | 54.7 s | 65 MB | not recorded |
  | z15 | 762.5 MB | 139.6 s | 98 MB | 796 MB |

  All [MEASURED]. The docs' own rule: "Each additional zoom level roughly doubles the size of the file" ([downloads](https://docs.protomaps.com/basemaps/downloads)); here z14 to z15 is 2.4x, because z15 holds individual buildings (below).
- **Build ourselves.** The profile is `protomaps/basemaps/tiles`, a Planetiler (0.10.2) Java project; the docs say it "can be run for your local city or country in minutes, or in about two hours for the planet on a high-end desktop" and clips with `--clip=<geojson>` ([build](https://docs.protomaps.com/basemaps/build)). An official `Dockerfile` exists in the repo (`maven:3-eclipse-temurin-22-alpine` build, `eclipse-temurin:22-jre-alpine` runtime). **[MEASURED]** `podman build` of commit `42ffaaa` (4.15.2) succeeded: 8.6 min wall including image pulls and 9+ unit-test classes; image `localhost/cn-protomaps-basemap:4.15.2`, 279 MB. The Dockerfile's base images are unqualified names, which podman refused without a TTY; fully qualified `docker.io/library/...` names were needed (changed in a copy under the cache, not in the repo). **Not measured: running the profile on the Philippines extract; build stopped to free memory on the workstation.**
- The build downloads, besides the PBF: Natural Earth GeoPackage (naciscdn.org), OSM water and land polygons (`osmdata.openstreetmap.de`), Daylight landcover (`r2-public.protomaps.com`), QRank (`qrank.toolforge.org`), and `pgf-encoding.zip` (`wipfli.github.io`) ([Basemap.java](https://raw.githubusercontent.com/protomaps/basemaps/main/tiles/src/main/java/com/protomaps/basemap/Basemap.java)). All but the `osmdata` host answered from the workstation [MEASURED, HTTP HEAD].

### Schema (v4)

From the [layers page](https://docs.protomaps.com/basemaps/layers), "derived from the open source Tilezen project": `boundaries`, `buildings`, `earth`, `landcover`, `landuse`, `places`, `pois`, `roads`, `transit` (documented as "currently empty"), `water`. The extract's metadata lists nine layers (all but `transit`) [MEASURED].

- **Roads:** `kind` = `highway`, `major_road`, `minor_road`, `path`, `rail`, `ferry`, `pier`, `aeroway`; `kind_detail` carries the OSM class (motorway … residential, service, light_rail, subway). Enough for "white roads widening by class".
- **Buildings:** "z0-14 contains merged buildings, even disconnected ones. z15+ contains individual OSM equivalent buildings." In the Metro Manila box the file holds 2,670 building features at z14 and **1,894,723 at z15** [MEASURED]. That is why z15 is 2.4x z14. A calm grey base map may not need z15 buildings; the style can overzoom z14 or the profile can be built with `--maxzoom=14`.
- **Water, parks:** `water` (ocean, lake, river, canal …), `landuse` (`park`, `forest`, `school`, `hospital`, `neighbourhood`, …), `landcover`, `earth`.
- **Places:** `kind` = `country`, `region`, `locality`, `macrohood`, `neighbourhood`; `kind_detail` includes `city`, `town`, `village`, `quarter`, `suburb`.
- **POIs:** a curated key set, but "some raw OSM tag values are passed through". The z15 file has **713 distinct `kind` values** in Metro Manila, including `tree`, `crossing`, `street_lamp`, and misspelt or ad-hoc values such as `jeepney terminal`, `tricycle_station`, `tricylce_station`, `conveneince_store` [MEASURED]. A landmark filter must be an allow-list, not a deny-list. POIs are ranked by Wikidata QRank so prominent ones appear at lower zooms ([layers](https://docs.protomaps.com/basemaps/layers#ranking)).
- Every feature carries `min_zoom` and `sort_rank` hints ([layers](https://docs.protomaps.com/basemaps/layers)).

### Themes, glyphs, sprites

- Five flavors in the npm package `@protomaps/basemaps`: `light` and `dark` ("general-purpose basemap with icons"), `white`, `grayscale`, `black` ("for data visualization") ([flavors](https://docs.protomaps.com/basemaps/flavors)). A `Flavor` is a plain colour object that can be overridden with spread syntax, so "Google-Maps-style light grey" and a matching dark map are colour edits, not rewrites. The style code is BSD-3 and "map design is CC0" ([README](https://github.com/protomaps/basemaps)).
- Glyphs: `https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf` (GitHub Pages); sprites: `https://protomaps.github.io/basemaps-assets/sprites/v4/light`. Both "can be downloaded as ZIP files at the basemaps-assets repository, if you need to host them yourself" ([MapLibre page](https://docs.protomaps.com/basemaps/maplibre)). Sprites are required for town-spot circles, highway shields, and (light and dark only) POI icons ([flavors](https://docs.protomaps.com/basemaps/flavors)). The POI icons derive from the Mapzen/tangrams set (MIT) ([LICENSE_DATA](https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE_DATA.md)). Station, hospital, school, and mall icons for a *commuter-landmarks-only* base map would be a custom sprite sheet (the docs show `spreet` with Maki, CC0, for that) [INFERENCE: not checked icon by icon].
- Style/tile version coupling: a build's `version` (4.15.2) is "compatible with `@protomaps/basemaps` style v4.0.0 and newer" ([downloads](https://docs.protomaps.com/basemaps/downloads)).

### Licence and attribution

- "The tilesets that power the Protomaps basemap are Produced Works of the OpenStreetMap dataset under the Open Database License. Web maps and native apps that use this Produced Work must visibly attribute © OpenStreetMap." Protomaps credit is requested, not required. "If you distribute a modified 'fork' of these basemap styles or tilesets, or provide a tiles API based on them, you must name your product or service something different from Protomaps." ([README](https://github.com/protomaps/basemaps)). A self-hosted unmodified extract may keep the name.
- The Protomaps tiles mix OSM with other data: OSM-derived land/water polygons (ODbL), Natural Earth (public domain), and, **if the `landcover` layer is displayed**, ESA WorldCover via Daylight (CC-BY 4.0, needs its own credit) ([LICENSE_DATA](https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE_DATA.md)). A style that never draws `landcover` avoids the extra credit.

## C. Self-built with Planetiler

### Tooling

- **Container:** `ghcr.io/onthegomap/planetiler:0.10.2` (released 2026-03-29, 552 MB image; pulled in 49 s [MEASURED]). Planetiler's `main` README now asks for Java 25 for the jar; the container avoids that ([README](https://github.com/onthegomap/planetiler)). The default profile is OpenMapTiles ([README](https://github.com/onthegomap/planetiler)). Command used (output to the cache, never into the repo):

  ```
  podman run --memory=6g -v ~/.cache/commutenity/basemap/planetiler:/data \
    -v ~/.cache/commutenity/router/pbf:/pbf:ro ghcr.io/onthegomap/planetiler:0.10.2 \
    --download --download_dir=/data/sources --osm-path=/pbf/philippines-261102.osm.pbf \
    --output=/data/ph-omt.pmtiles --tmpdir=/data/tmp --force
  ```

- **Sizing rules.** "Give the JVM about 0.5x the size of the input `.osm.pbf` file" (about 300 MB for this 612 MB file), "at least 1GB of free SSD disk space plus 5-10x the size of the `.osm.pbf`", and "at least 0.5x as much free RAM as the input" ([README](https://github.com/onthegomap/planetiler)).
- The output format follows the file name: `--output=x.pmtiles` writes PMTiles directly ([README](https://github.com/onthegomap/planetiler)).

### What was measured (OMT build, partial)

**[MEASURED], run killed at about 10 minutes.** Container capped at 6 GB, 12 CPUs, default JVM settings (heap limit shown by Planetiler: 3.9 GB). The default OMT profile reads the Philippines extract in under 4 minutes:

| Phase | Time |
|---|---|
| Download of Natural Earth (434 MB) and lake centerlines (81 MB) | 59 s (first run only) |
| `osm_pass1` (node locations, relation members) | 42 s |
| `osm_pass2` (nodes, ways, relations) | 1 min 56 s (CPU 11 min 39 s) |
| `sort` | 1 min 43 s |
| `archive` (encode and write tiles) | started at 6:09; z12 finished at 6:34; **50% of features written at 10:00, file 156 MB** |

Peak container memory sampled every 2 s by `podman stats`: **4.27 GB** of the 6 GB cap, a figure that includes memory-mapped temp files and page cache; the JVM heap peaked at about 2.0 GB in the logged samples. The run was cut short by the owner's request, so **final time, final size, and size by max zoom for the self-built OMT file are not measured: build stopped to free memory on the workstation.** [INFERENCE] The OpenFreeMap extract (same Planetiler OMT profile, z14) is the best proxy for the final size: 519 MB. A full run would likely land in the 15–25 minute range on this machine, dominated by the tile-writing phase (planet runs spend 2 of 5 hours there, per the OpenFreeMap cadence page); that is a guess, not a measurement.

**A placeholder was used for ocean polygons.** Planetiler downloads `water-polygons-split-3857.zip` from `osmdata.openstreetmap.de` (the first attempt failed there with a connect error [MEASURED]); that host answered `No route to host` / timeout on ports 80 and 443 from the workstation on 2026-11-06 [MEASURED], and the read tool's fetcher could not reach it either. Planetiler's tiny test fixture (Monaco only) stood in, so the partial OMT run had no real ocean polygons. Consequences: (a) the timings and the 156 MB mark above are not a faithful size for a build with ocean polygons; (b) **the monthly rebuild of either profile depends on that single host**; the zip should be mirrored in our own storage when the pipeline is built [INFERENCE]. The Protomaps profile needs both the water and the land polygon files from the same host.

### OpenMapTiles licensing for a self-build

- Code is BSD-3; "design and the cartography decisions encoded in the schema" are CC-BY 4.0. "Products or services using maps derived from OpenMapTiles schema need to **visibly credit 'OpenMapTiles.org'** or reference 'OpenMapTiles' with a link"; "exceptions … can be granted on request" ([README](https://github.com/openmaptiles/openmaptiles), [LICENSE](https://raw.githubusercontent.com/openmaptiles/openmaptiles/master/LICENSE.md)). A Planetiler-built OMT tileset therefore carries the same "© OpenMapTiles" credit as OpenFreeMap's. Using the Protomaps profile or a custom/Shortbread YAML avoids it; Shortbread's schema docs are CC0 ([Shortbread](https://shortbread-tiles.org/)).

## What the tiles contain: the ticket's feature list [MEASURED]

Counts below are feature-in-tile counts over the Metro Manila box. OMT numbers are from the OpenFreeMap z14 extract; Protomaps numbers from the z15 extract. Files are kept under `~/.cache/commutenity/basemap/` (see [Files](#files-kept-for-prototype-work)).

### Layers by zoom

| Zoom | OMT (OpenFreeMap) features per layer, Metro Manila | Protomaps |
|---|---|---|
| z10 | `place` 1,257; `transportation` 312; `water` 376; `landcover` 223; `park` 30; no `poi`, no `building` | `landuse` 2,592; `places` 558; `roads` 236; `water` 441; `pois` 4 |
| z12 | `transportation` 27,342; `place` 1,745; `poi` 369; `landuse` 1,248; `water` 1,750; no `building` | `landuse` 11,420; `places` 3,747; `pois` 2,523; `roads` 2,124; `buildings` 61 |
| z14 | `poi` 265,706; `place` 20,142; `transportation` 49,652; `building` 4,327; `housenumber` 23,071; `park` 114 | `pois` 16,877; `places` 3,117; `roads` 46,128; `buildings` 2,670; `landuse` 23,889 |
| z15 | n/a | `buildings` 1,894,723; `pois` 159,872; `roads` 76,383 |

Note how many POIs OMT carries at z14 (265,706 features in the box, shops, restaurants, gates, parking): the file is 1.6x the Protomaps z14 file (519 vs 322 MB) mostly for that reason [INFERENCE: layer bytes were not split out]. A calmer base map filters them in the style, but they still ship in every z14 tile unless the tileset is rebuilt without them.

### Road, building, water, park classes

- **OMT `transportation`:** `class` values and `subclass` are present; `transportation_name` carries road names (51,299 features at z14). `building` appears from z13 (58), 4,327 at z14, and `housenumber` at z14.
- **OMT `park` / `landuse` / `water` / `waterway`:** present from z10 or earlier (`park` 30 at z10).
- **Protomaps:** equivalents are `roads`, `buildings`, `water`, `landuse` (parks, `school`, `hospital` polygons).

### Landmark classes

OMT keys POIs by `class`/`subclass` ([poi.yaml](https://raw.githubusercontent.com/openmaptiles/openmaptiles/master/layers/poi/poi.yaml)): mall is `shop/mall`, market is `grocery/marketplace`, church is `place_of_worship` (subclass = religion), school `school`, hospital `hospital`, bus terminal `bus/bus_station`, rail station `railway/station`, `railway/subway` (subway station and entrance), `railway/halt`, `railway/tram_stop`. Protomaps keys by raw-ish `kind`.

| Landmark | OMT z12 / z13 / z14 | Protomaps z12 / z13 / z14 / z15 |
|---|---|---|
| Mall | 0 / 0 / 772 (`shop/mall`) | 18 / 46 / 164 / 289 (`mall`) |
| Market | 0 / 0 / 971 (`grocery/marketplace`) | 0 / 5 / 156 / 415 (`marketplace`); `public_market` 0 / 0 / 1 / 7 |
| Church / place of worship | 0 / 0 / 6,134 (class `place_of_worship`, all subclasses) | 0 / 2 / 790 / 2,824 (`place_of_worship`); `church` only 1 at z15 |
| School | 0 / 0 / 5,822 (`school/school`) | 0 / 20 / 849 / 2,812 (`school`) |
| Hospital | 0 / 0 / 735 (`hospital/hospital`; clinics 1,631) | 56 / 67 / 280 / 353 (`hospital`) |
| Bus station | 0 / 0 / 656 (`bus/bus_station`) | 0 / 6 / 104 / 309 (`bus_station`) |
| Rail station | 134 / 155 / 171 (`railway/station`); `railway/subway` 90 / 92 / 96 | 5 / 25 / 58 / 124 (`station`); `subway_entrance` 67 at z15, `platform` 20 / 60 |
| Ferry terminal | 145 / 134 / 139 | 0 / 0 / 7 / 67 |
| Jeepney / tricycle terminal | not a class; falls under `bus` only if tagged `amenity=bus_station` | `jeepney_terminal` 1, `tricycle_terminal` 1, `terminal` 10 at z15; ad-hoc spellings |

Reading: **in both schemas the landmark set appears only from z12–z14; a "mid zoom" landmark layer starts at z13 at the earliest for Protomaps (ranked) and z14 for OMT** (except stations, ferry terminals, and universities, which OMT includes from z12) [MEASURED]. OMT has no per-feature ranking at low zoom beyond a `rank` field intended for z14 thinning ([poi.yaml](https://raw.githubusercontent.com/openmaptiles/openmaptiles/master/layers/poi/poi.yaml)). Protomaps promotes malls, hospitals, and stations that have Wikidata tags to z12 via QRank ([layers](https://docs.protomaps.com/basemaps/layers#ranking)). Jeepney terminals, the commuter landmark most specific to the Philippines, are effectively absent from both; they would need a custom profile or a tag-to-class rule [INFERENCE].

### City, barangay, and boundaries

| | OMT (OpenFreeMap) | Protomaps |
|---|---|---|
| City / municipality names | `place` class `city` (150 at z10, 208 at z12), `town`, `village` | `places` `locality/city` 66 at z10 (also `town`, `village`) |
| Neighbourhood names (barangay-sized) | `suburb` from z12 (642), `neighbourhood` 12,058 and `quarter` 6,997 at z14 only | `macrohood/quarter` 240 at z10, 1,713 at z12; `neighbourhood/neighbourhood` 1,668 at z12; `neighbourhood/suburb` 96 at z12 |
| Boundary lines | `boundary` has `admin_level` 3–10; level 10 present at z12 (27 line features) and 197 at z14 | `boundaries` stops at `kind_detail` 8 (3, 4, 5, 6, 7, 8); no 9 or 10 |
| Names on boundaries | none (lines only) | none (lines only) |

- **The barangay is mapped two ways in OSM and the schemas use only one for names.** The extract holds 5,040 relations with `boundary=administrative` and `admin_level=10`, all with a `name`, plus 55 at level 9, 118 at level 8, 911 at level 6, 89 at level 4 [MEASURED with pyosmium over the Geofabrik extract, 59,390 relations in total]. Neither schema labels those polygons: OMT draws them as unnamed boundary lines, Protomaps drops them. Labels come from `place=neighbourhood|quarter|suburb` points, which exist in the Metro Manila box as about 1,875 neighbourhood + 1,093 quarter + 95 suburb names in the Protomaps z15 file [MEASURED, tile-edge duplicates included]. Whether that set matches the official barangay list is **not measured**; the prototype should compare the two lists.
- **Zoom for barangay names:** Protomaps ships neighbourhood points from z12 and OMT only at z14, so "barangay names at neighbourhood zoom" costs nothing extra in Protomaps tiles and needs z14 data in OMT [MEASURED].
- A custom Planetiler profile could emit label points for admin level 10 polygons; neither stock profile does [INFERENCE].

## ODbL obligations of serving the result publicly

Primary texts: the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), the OSMF [Licence and Legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ), the board-endorsed [Produced Work guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline), and the [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).

1. **A tile service is likely a Produced Work.** The OSMF FAQ: "you can always take OSM data and deploy your own tile service. It is then likely that your tile service would be deemed a Produced Work", and "Most uses of OSM are as Produced Works … have a website or API service that delivers map tiles". ODbL §1 defines a Produced Work as a work "resulting from using the whole or a Substantial part of the Contents … from this Database, a Derivative Database, or … a Collective Database".
2. **Duties for a Produced Work.** §4.3: if you Publicly Use one, include "a notice … reasonably calculated to make any Person that uses, views … aware that Content was obtained from the Database … and that it is available under this License" (example text: "Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL)"). §4.5(b): creating a Produced Work "does not create a Derivative Database for purposes of Section 4.4", so **share-alike does not attach to the base map as an image or rendered map**. The FAQ adds that a Produced Work can have any licence, "but you must upon request offer recipients either a copy of your data and any Derivative Database … or the means of creating the Derivative Databases", and that "If you haven't made changes to the OSM data, you can simply refer users back to openstreetmap.org as the data source".
3. **The catch for vector tiles.** The Produced Work guideline: "If the published result of your project is intended for the extraction of the original data, then it is a database and not a Produced Work", and "Database dumps are usually not Produced Works". A `.pmtiles` or `.mbtiles` carries the geometry and tags (as `pmtiles extract` and the inspection above show), so a hosted file that anyone can range-request is closer to a database than a rendered PNG. The OSMF has not ruled on vector tiles: the LWG minutes of 2025-09-08 discuss a complaint about `.mwm` vector map files, noting "The idea that .mwm are big blobs of map data, which are used to power a vector-tile rendering display, seems correct", and record only an action to ask the project to disclose that its data is ODbL ([minutes](https://osmfoundation.org/wiki/Licensing_Working_Group/Minutes/2025-09-08)). The wiki's discussion (not the OSMF's view) says Garmin-style vector files are Produced Works when distributed to provide a visual map ([wiki](https://wiki.openstreetmap.org/wiki/Open_Data_License/Produced_Work_-_Guideline)).
4. **If it were a Derivative Database:** §4.4 requires the file be under the ODbL (or compatible); §4.6 requires offering "a copy in a machine readable form of the entire Derivative Database" or "a file containing all of the alterations … or the method of making the alterations … (such as an algorithm)", free of charge over the internet. §4.4(c) extends this to a Produced Work "created from the Derivative Database".
5. **Protomaps' own position:** its tilesets "are Produced Works of the OpenStreetMap dataset" ([README](https://github.com/protomaps/basemaps)); OpenFreeMap states only attribution. Neither is an OSMF ruling [INFERENCE].
6. **A cheap way to satisfy both readings** [INFERENCE, not legal advice]: ship the notice, and publish a "map data" page that (a) names OpenStreetMap contributors and the ODbL, (b) links the exact source extract (Geofabrik `philippines-261102` or the Protomaps / OpenFreeMap build ID and date), (c) gives the build recipe (Planetiler image tag, arguments, profile commit) or links the upstream extract, and (d) says the tile file may be reused under ODbL. For an unmodified Protomaps or OpenFreeMap extract the "alterations" are just `pmtiles extract --bbox`, so a link to the upstream build plus that command is a complete method. For a self-build the Planetiler command and profile version are the algorithm.
7. **Keep our own data out of the tile file.** Pins, street paths, and transfers are drawn as separate layers on top ("horizontal layers" in the OSMF vocabulary, see [FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ)); only if they were merged into the tileset would the question of a Collective vs Derivative Database arise. The rail file (`src/lib/rail`) is already an ODbL-labelled data file from the same extract per the earlier rail research.
8. **Attribution placement** (inputs for the attribution ticket): interactive maps: "the credit should typically appear in a corner of the map", may collapse after 5 seconds or on interaction if an (i) button stays; static images: same as interactive, "if multiple static images appear on the same document, one instance of attribution is sufficient", and "small thumbnails/icons do not require attribution", nor do images of fewer than 100 features or under 10,000 m² ([Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)). The FAQ repeats the thumbnail and area exemptions. Schema credits ("© OpenMapTiles", optionally "OpenFreeMap" or "Protomaps") are separate and come from the schema owner, not the ODbL.

## Effort to keep it current monthly

| Route | Monthly steps | Cost, from measurements | Fragility |
|---|---|---|---|
| OpenFreeMap hosted | none | none | can stop "at any time without notice"; automated collection barred; tile URLs change weekly |
| OpenFreeMap weekly PMTiles → `pmtiles extract` | pick a run ID from `files.txt`, extract with `--bbox`, upload | 1 min 19 s, 66 MB RSS, 544 MB transferred [MEASURED, z14] | depends on the operator keeping the files (last 4 runs + 6 monthly firsts); schema OMT fixed |
| Protomaps daily → `pmtiles extract` | pick a build ≤ 1 week old or a patch-version build, extract | 2 min 20 s at z15, 98 MB RSS [MEASURED] | "URLs may change"; must match style package version; dates differ from the router's Geofabrik extract |
| Protomaps profile, own build | run the container on the extract | image build 8.6 min once [MEASURED]; run time not measured | `osmdata.openstreetmap.de` single host, unreachable from the workstation today |
| Planetiler OMT, own build | run the container on the extract | reading, sort, and the start of tile writing took 6 min; tile writing was half done at 10 min [MEASURED]; total not measured | same polygon host; "© OpenMapTiles" credit |

- **Same-extract coherence.** The router and rail file use Geofabrik `philippines-261102` (2026-11-02). The Protomaps 2026-11-05 build carries OSM replication time 2026-11-05T04:00Z; the OpenFreeMap run is from 2026-11-01 [MEASURED from metadata]. A base map from one of those and a rail file from another can disagree by days, for example on a re-tagged station name. If "same extract" is a hard requirement only the self-build satisfies it; if "same month" is enough, an extract does [INFERENCE].
- **Rebuild trigger.** Geofabrik refreshes the extract daily; the monthly build can run `scripts/router/download.sh` and then the tile step. A new tile file needs a new URL or an `ETag`/version in the style's source URL to bust browser and CDN caches; that is the hosting ticket's problem.

## Constraints the source puts on neighbouring tickets

- **Thumbnails (ADR 0005, no MapLibre in the feed).** None of the three sources produces images. Feed thumbnails need either a server-side/offline render of vector tiles into static images (a different tool: MapLibre native or a headless browser) or a prebuilt raster tile set from the chosen style, which is exactly what the Protomaps/OMT tiles are not [INFERENCE]. Today's `StaticTileCanvas` stitches PNG tiles from `/api/tiles`; a vector source cannot feed it directly.
- **`/api/tiles` and ADR 0003.** The current proxy applies "OSM tile usage policy" (7-day cache, identifying User-Agent). With a self-hosted PMTiles file there is no third party to protect, so the proxy would become a range-request or z/x/y server for our own file; `src/lib/map/tiles.ts` bounds (`isPhilippineTile`, zoom 0–19) would change to the new max zoom (14 or 15 plus overzoom). With hosted OpenFreeMap the proxy's caching role is the "automated collection" question above.
- **Hosting size.** The Philippines files above (0.32–0.76 GB) are small enough for object storage; OpenFreeMap's maintainer reports poor range-request latency for huge (90 GB) files on Cloudflare and high AWS transfer costs ([README FAQ](https://github.com/hyperknot/openfreemap)), which are planet-scale concerns that a sub-1 GB file mostly avoids [INFERENCE].

## Recommendation (not a decision)

- **Prototype the style against the Protomaps basemap extract** (`protomaps-20261105-ph-z14.pmtiles`, 322 MB, or the z15 file if buildings at z15 matter). It has the `grayscale`/`light`/`dark` flavors as a starting point for the calmer palette, ranked landmark POIs from z12–z13, neighbourhood name points from z12, a documented self-build path, and attribution limited to OSM. Do **not** carry the 713 raw `pois` kinds into the style; allow-list `mall`, `marketplace`, `place_of_worship`, `school`, `hospital`, `bus_station`, `station`, `ferry_terminal`, and tally the missing jeepney terminals separately.
- **Host the file ourselves** (a Philippines extract or build, not the hosted OpenFreeMap), because it removes the "no guarantee" and "automated collection" risks and satisfies "production from day one, no openstreetmap.org fallback". Keep OpenFreeMap's weekly PMTiles as the second source (same extract flow, OMT schema, z14), and use it if the prototype shows the OMT `boundary` admin-level-10 lines are wanted for barangay borders, which Protomaps cannot draw.
- **Treat self-building as a decision for the monthly-rebuild ticket, not for this one.** It is the only way to share one extract with the router and rail file and to add barangay label points or jeepney terminals, but it needs the unreachable polygon host mirrored and a final measured run (time, size, peak memory) that this research could not finish.
- **For ODbL:** attribute in-map; add a "map data" page with the extract ID, the recipe, and the ODbL statement; keep pins, street paths, and transfers in separate layers.

## Files kept for prototype work

All under `~/.cache/commutenity/basemap/` (2.8 GB; nothing is in the repo):

- `pmtiles/protomaps-20261105-ph-z{12,13,14,15}.pmtiles`: Protomaps extracts, bbox 116,4,127,21.
- `pmtiles/ofm-20261101-ph-z{12,13,14}.pmtiles`: OpenFreeMap OMT extracts (z14 from the weekly planet PMTiles; z12 and z13 cut locally from it).
- `bin/pmtiles` (CLI 1.31.2), `venv/` (pmtiles, mapbox-vector-tile, osmium), `inspect_tiles.py` (decodes tiles over a bbox and tallies layer/class counts), `count_admin.py`, `reports/{pm,omt}-manila.json` (the tallies behind the tables above), `run-planetiler.sh` (memory-sampling harness), `logs/` (extract timings and the partial Planetiler log), `builds.json` (Protomaps build list), `protomaps/basemaps/` (profile checkout, `tiles/Dockerfile.local` with qualified image names), `planetiler/sources/` (Natural Earth, lake centerlines, the placeholder water polygons).
- Container images left in podman: `ghcr.io/onthegomap/planetiler:0.10.2`, `localhost/cn-protomaps-basemap:4.15.2`, and two Maven/Temurin base images. No container is running.

## Sources

- OpenFreeMap: [README](https://github.com/hyperknot/openfreemap), [Terms of Service](https://openfreemap.org/tos/), [quick start](https://openfreemap.org/quick_start/), [release cadence](https://github.com/hyperknot/openfreemap/blob/main/docs/tilegen_release_cadence.md), [LICENSE](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md), [styles repo](https://github.com/hyperknot/openfreemap-styles), TileJSON `https://tiles.openfreemap.org/planet/latest`, [file index](https://btrfs.openfreemap.com/files.txt).
- Protomaps: [downloads](https://docs.protomaps.com/basemaps/downloads), [layers](https://docs.protomaps.com/basemaps/layers), [build](https://docs.protomaps.com/basemaps/build), [flavors](https://docs.protomaps.com/basemaps/flavors), [MapLibre assets](https://docs.protomaps.com/basemaps/maplibre), [PMTiles concepts](https://docs.protomaps.com/pmtiles/), [repo and licensing README](https://github.com/protomaps/basemaps), [LICENSE_DATA](https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE_DATA.md), [Basemap.java](https://raw.githubusercontent.com/protomaps/basemaps/main/tiles/src/main/java/com/protomaps/basemap/Basemap.java), [builds list](https://build-metadata.protomaps.dev/builds.json).
- Planetiler and schemas: [Planetiler README](https://github.com/onthegomap/planetiler), [PLANET.md](https://github.com/onthegomap/planetiler/blob/main/PLANET.md), [OpenMapTiles README and licence](https://github.com/openmaptiles/openmaptiles), [OMT poi layer](https://raw.githubusercontent.com/openmaptiles/openmaptiles/master/layers/poi/poi.yaml), [Shortbread](https://shortbread-tiles.org/).
- ODbL and OSMF: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), [Licence and Legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ), [Produced Work guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline), [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), [LWG minutes 2025-09-08](https://osmfoundation.org/wiki/Licensing_Working_Group/Minutes/2025-09-08), [OSM wiki: Produced Work discussion](https://wiki.openstreetmap.org/wiki/Open_Data_License/Produced_Work_-_Guideline).
