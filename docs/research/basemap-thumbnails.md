# Drawing feed thumbnails from a vector base map

Research for the "Calmer base map" map ([#32](https://github.com/geadlydrim/CommuteNity-Web/issues/32)), ticket [#35](https://github.com/geadlydrim/CommuteNity-Web/issues/35) ("Drawing feed thumbnails from a vector base map"). Researched 2026-11-06. This file records facts, measurements and options with a recommendation; **it does not decide**. ADR 0005 stands: the feed ships no live MapLibre map. The question is only how a feed thumbnail can show the same **base map** as the live maps once the base map is vector.

How to read it:

- Claims link to the page or file that owns them (docs, source, licence and pricing pages). Repo claims name the file.
- **[MEASURED]** marks a number from my own run on 2026-11-06 (setup in [Measurement setup](#measurement-setup)). **[INFERENCE]** marks a conclusion no source states outright.
- Vocabulary follows `GLOSSARY.md`: **base map**, pin, post map, guide, street path, focus view. "Thumbnail" means the static image in the feed card (`StaticPostMap`, `StaticGuideMap`).
- The vector tile source and where it is hosted are decided by sibling tickets. I used OpenFreeMap's `positron` style only because it needs no key. Its [terms](https://openfreemap.org/tos/) forbid collecting data from the service in automated ways, so a production renderer must read our own tiles, not OpenFreeMap's.

## Short answer

1. **Rendering raster tiles from our vector style on our server works, and the output matches a single render.** MapLibre Native for Node (`@maplibre/maplibre-gl-native` 6.4.1) rendered Metro Manila from the OpenFreeMap positron style. A 600×320 image took a median 111 ms and a 256 px tile a median 92 ms, with a new `Map` per render and the vector tiles already in memory (12 cores). A 3×3 grid of separately rendered 256 px tiles differed from one 768 px render in at most 0.66 % of pixels, so tile seams were not visible in my samples [MEASURED].
2. **It cannot run inside the Next.js app on Vercel's standard Node functions.** The prebuilt binary needs glibc 2.38, an X display and OpenGL libraries; Vercel's build image is Amazon Linux 2023 (glibc 2.34). On AL2023 the module fails to load, and with no X server it aborts the process [MEASURED]. It needs its own container (Vercel's Container Runtime beta is one place to run one; so is the host that runs the router).
3. **No hosted renderer gives raster tiles of *our* style without a key or usage billing.** MapTiler static maps need a key and a paid plan, Stadia needs a key or domain auth (storing images needs a paid plan), CARTO raster tiles now need a key, and OpenFreeMap is vector only. All conflict with ADR 0003's "no keyed or usage-billed services".
4. **Per-tile and per-card are two shapes of the same renderer.** Tiles behind `/api/tiles` (changes: the proxy's upstream URL, a theme/version parameter, WebP output, attribution) keep `StaticTileCanvas` almost as is. One image per card (changes: a new route, `StaticTileCanvas` loses its tile grid) sends 1 request and up to 3.9× fewer pixels than 3–8 tiles, but needs a route that reads the post. Publishing-time storage adds Supabase Storage and a re-render of every stored image on each monthly rebuild and for the dark variant.
5. **Image format matters more than render time.** My default PNG tiles averaged 58 KB; palette PNG 19 KB; WebP (quality 80) 9 KB [MEASURED]. A feed of 50 cards at 8 tiles each would be about 23 MB with sharp's default PNG; the same in WebP is about 3.6 MB [INFERENCE: arithmetic on the means].
6. **Keeping thumbnails on openstreetmap.org tiles is the cheapest and the worst fit.** It leaves two looks, and the tile policy's section 3.4 lists the pattern our proxy uses (every client behind one identity, no `Referer`) under "You must not", enforced by blocking without notice [INFERENCE: from `route.ts` against the policy text].
7. **Recommendation:** run MapLibre Native as a small renderer service in a container beside the router; keep `/api/tiles` as the browser's only door and make it fetch from the renderer; serve WebP, with a `@2x` `srcset`, and keep the SVG overlay. See [Recommendation](#recommendation).

## What exists today

Read from the repo at `origin/main` (worktree base):

- `StaticTileCanvas` (`src/components/map/static-tile-canvas.tsx`) is a server-safe component. From `fit` (centre + **integer** zoom `Z`, from `fitPointsToView`, zoom 3–18, 32 px padding) and a design `width × height`, it computes the world-pixel origin, walks the 256 px tile range, and renders one `<img src={tileUrl(Z, tx, ty)} loading="lazy">` per tile at `left/top = tile*256 - origin` (rounded), inside a box scaled by `100cqw / width` (container query). Callers draw pins and polylines through `project(lat, lng)` in that same pixel space. It also draws `OsmAttribution` (© OpenStreetMap contributors, bottom-right).
- `map-previews.tsx` renders post maps at 560×240 and guides at 480×200. By the range arithmetic above that is 3–8 tiles per post map and 2–6 per guide: worst case 8×65,536 px = 524,288 px of tiles for 134,400 px visible, 3.9× over-fetch [INFERENCE: arithmetic from the code]. A feed of 50 post maps is up to 400 tile URLs.
- `tileUrl` (`src/lib/map/tiles.ts`) returns `/api/tiles/{z}/{x}/{y}` (no extension, no theme, no version). `isPhilippineTile` accepts z 0–19 inside the Philippine pin bounds plus a one-tile margin; `MAX_TILE_ZOOM = 19`.
- The proxy (`src/app/api/tiles/[z]/[x]/[y]/route.ts`, Node runtime, `force-dynamic`, `maxDuration 10`) validates `^\d{1,7}$` indices, then `fetch`es `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with only a `User-Agent` (`geocoderUserAgent()`), an 8 s timeout, and answers `image/png` with `Cache-Control: public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400`. Middleware skips `/api/tiles/*`.
- The live map uses the same proxy as a raster source (`osm-style.ts`, `tileUrlTemplate()`). When #33–#36 move live maps to a vector style, `osm-style.ts` and `tileUrlTemplate()` go away and `/api/tiles` would serve thumbnails only.
- Posts cannot be edited (the only `.update(` calls under `src/` are on `users`), so a post's `map_data` never changes after insert [INFERENCE from grep]. Theme is class-based (`next-themes`, `attribute="class"`, `@custom-variant dark (&:is(.dark *))`), so the server cannot tell which theme a viewer has.

Camera detail the renderer must honour: `StaticTileCanvas` works in 256 px world units, so `Z` there equals MapLibre's GL zoom plus 1 (a 256 px XYZ tile at `z` equals a 256 px render at GL zoom `z-1`). I rendered tiles that way (`zoom: Z - 1`) and the 3×3 stitch lined up with the single render [MEASURED].

## Measurement setup

- Host: 12 cores, 14 GB RAM, podman 5.8. Container: `ubuntu:24.04` (the only Linux the package's README lists as prebuilt), Node 22.21.1, `@maplibre/maplibre-gl-native` 6.4.1 ([npm](https://www.npmjs.com/package/@maplibre/maplibre-gl-native), [README](https://github.com/maplibre/maplibre-native/blob/main/platform/node/README.md): "Ubuntu 24.04 (amd64/arm64) … Node.js 22, 24, 26"), `sharp` for PNG/WebP, Xvfb 24-bit, Mesa software GL [INFERENCE: no GPU device in the container; I did not print `GL_RENDERER`].
- Style: `https://tiles.openfreemap.org/styles/positron` (55 layers, an OpenMapTiles vector source plus a Natural Earth raster), fetched 2026-11-06. Camera: Manila City Hall area, 120.9842 E, 14.5995 N.
- Fetching: a `request` callback reading a disk cache filled on first run, so "warm" numbers contain no network. Containers ran with `--memory 3g`; the Vercel-like runs used `--cpus 1 --memory 2g` (Vercel's default function size is 2 GB / 1 vCPU, [limits](https://vercel.com/docs/functions/limitations#memory-size-limits)).
- Everything lives under `~/.cache/commutenity/basemap/thumbs-test/` (scripts, cache, output PNGs). Nothing was written to the repo except this file; the containers were `--rm`.

## Results

### Install and footprint [MEASURED]

| | Result |
|---|---|
| `npm install @maplibre/maplibre-gl-native` | 28 s, 183 packages, `node_modules` 57 MB; the binary `lib/node-v127/mbgl.node` is 13.0 MB (13,027,888 bytes). The README lists prebuilt binaries for Node 22, 24 and 26 only (I did not try Node 20) |
| with `sharp` | `node_modules` 105 MB |
| Shared libraries `mbgl.node` links to | libcurl, libuv, libjpeg (`.so.8`), libwebp (`.so.7`), libpng16, ICU 74, **libGLX, libOpenGL, libX11, libXext** |
| Runtime packages I had to add on Ubuntu | 68 packages (no recommends) for those libs plus Mesa and Xvfb; the image grew from 348 MB to 704 MB. Largest files: `libLLVM.so.20.1` 137 MB (Mesa's software rasteriser), ICU data 30 MB |
| Without an X display | the process dies: `Failed to open X display.` then `terminate called after throwing an instance of 'std::runtime_error'` |
| On Amazon Linux 2023 (`public.ecr.aws/amazonlinux/amazonlinux:2023`, glibc 2.34) | `require` fails: `libGLX.so.0: cannot open shared object file`; `ldd` lists 11 missing libraries and the binary asks for `GLIBC_2.38` (max), `GLIBCXX_3.4.32`, `CXXABI_1.3.13` (via `objdump -T`); AL2023 provides glibc 2.34 |

### Render time and memory [MEASURED]

New `mbgl.Map` per render unless noted; vector tiles served from the local cache; render time excludes PNG/WebP encoding.

| Case | 12 cores | 1 vCPU / 2 GB |
|---|---|---|
| First render ever (style, sprite, glyphs, tiles over the network: 11 requests, 2.46 MB) | 3.4 s | n/a |
| First render in a fresh process, everything cached on disk | n/a | 855 ms (plus `require` 57 ms; Xvfb was up after at most 1 s, the delay my script waited) |
| 600×320 @1x, median of 10 | 111 ms | not run |
| 256×256 @1x, median of 10 | 92 ms | not run |
| 256 px tile, 64 tiles one after another | 105 ms each | 128 ms each |
| 64 tiles, 2 / 4 / 8 concurrent Maps | 53 ms each (19 tiles/s) at all three | 91 / 90 / 94 ms each (about 11 tiles/s) |
| One `Map` reused for 64 tiles (best case: its tile cache is hot) | 18 ms each | 27 ms each |
| 512 px @1x / @2x (1024 px), median of 16 | 110 / 106 ms | not run |
| Process memory | Node idle 77 MB; 208–226 MB after the first render; 256–275 MB after 64 tiles; peak RSS 314 MB (2 Maps), 388 MB (4), 510 MB (8) | peak 264 MB sequential, 495 MB at 8 concurrent |

So one render service on one vCPU does about 8–11 uncached tiles per second and fits in 1 GB.

### Output size [MEASURED]

| Image | PNG (sharp default) | PNG palette (q80) | WebP q80 | JPEG q80 |
|---|---|---|---|---|
| 256 px tile @1x, mean of 64 | 58.1 KB | 19.0 KB | 9.0 KB | 10.9 KB |
| 512 px tile @1x / @2x, mean of 16 | n/a | n/a | 32.0 KB / 92.7 KB | n/a |
| 560×240 whole image @1x | 140.9 KB | 45.4 KB | 22.8 KB | 26.5 KB |
| 560×240 whole image @2x | 394.0 KB | 129.1 KB | 64.0 KB | 86.3 KB |

Encoding added 8–12 ms per 256 px tile.

### Fidelity [MEASURED]

- **Native tiles vs native single image.** Nine tiles rendered one by one and stitched, against one 768×768 render of the same camera, at XYZ zoom 12, 13, 14, 16 and 18: 0.13–0.66 % of pixels differed at all (z14: 3,878 of 589,824) and at most 74 pixels differed strongly (summed RGB difference over 60), near or far from seams alike. I looked at the zoom-16 side-by-side: labels crossing tile seams (street names, "Pasig River") looked continuous.
- **Native vs MapLibre GL JS** (5.24.0 in Chromium, `pixelRatio: 1`, same style, same camera, 600×320, GL zoom 14 and 16). At zoom 14, which I compared by eye, roads, buildings, water and park geometry were identical. 46.9 % of pixels differed slightly (anti-aliasing) and 1.0 % strongly; at zoom 16, 27.8 % and 0.1 %. At zoom 14 the strong differences are label choices: GL JS drew a "Swiming pool" label and "BARANGAY 387"; native drew "Arlegui Street" instead. So label **placement is not identical between engines**, and a thumbnail will not show exactly the labels of the live map at the same camera. I did not compare text anti-aliasing or sprites beyond this.
- Roads, fills and colours come from one style file in both engines, so a style change in the spec's prototype reaches both (the engines share a style specification, [MapLibre style spec](https://maplibre.org/maplibre-style-spec/)).

## Does it run on Vercel?

Evidence from Vercel's docs and my AL2023 run:

- Function limits: 250 MB uncompressed bundle (500 MB Python), 2 GB / 1 vCPU default and 4 GB / 2 vCPU on Pro, 800 s max duration on Pro, 1,024 shared file descriptors ([limits](https://vercel.com/docs/functions/limitations)). "Large functions" lift the bundle to 5 GB (beta) ([same page](https://vercel.com/docs/functions/limitations#large-functions-beta)). The binary (13 MB) fits; the 350 MB of runtime libraries I needed would only fit with large functions.
- Node 22, 24 and 26 are available; Node 20 is being deprecated on 2026-10-01 ([versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)). That matches the binary's supported majors.
- The build image is Amazon Linux 2023 ([build image](https://vercel.com/docs/builds/build-image)). The docs I read do not state the function runtime's OS; I assume it matches [INFERENCE]. If so, glibc 2.34 cannot load a binary that needs 2.38, and Vercel functions give no X server or OpenGL stack for the process to attach to. Both are measured above on AL2023 itself, not on Vercel.
- Next.js tracing, `serverExternalPackages` and `outputFileTracingIncludes` could ship the `.node` file ([Vercel notes `outputFileTracingIncludes`](https://vercel.com/docs/functions/limitations#bundle-size-limits)), but that does not fix the OS and display requirements. I did not try a deployment.
- **What does run on Vercel is a container:** the Container Runtime (beta, all plans) builds a root `Dockerfile` into a Fluid-compute function, with the same limits and pricing, scale-in after 5 minutes idle in production ([container runtime](https://vercel.com/docs/functions/runtimes/container), [Docker on Vercel](https://vercel.com/kb/guide/docker)). It is "for apps that depend on a system library", so Xvfb and Mesa fit in the image. I did not deploy to it, and Hosting is a sibling ticket.
- Pricing basis if run there: Active CPU $0.160/h in Singapore, memory $0.0133/GB-h, invocations $0.60 per million ([pricing](https://vercel.com/docs/functions/usage-and-pricing)). At 0.1 s of CPU per uncached tile, a million uncached tiles is about 28 CPU-hours, about $4.4 of CPU plus memory and invocations [INFERENCE: arithmetic]. The CDN absorbs repeats: tiles carry `s-maxage=604800`.
- The official `maptiler/tileserver-gl` image is 282 MB compressed (amd64) ([Docker Hub API](https://hub.docker.com/v2/repositories/maptiler/tileserver-gl/tags?name=latest)); it wraps the same native module (tileserver-gl 5.7.0 depends on `@maplibre/maplibre-gl-native` 6.4.1) and is run with `xvfb-run` outside Docker ([README](https://github.com/maptiler/tileserver-gl#getting-started-with-linux-cli)). The `-light` image has no raster rendering ([README](https://github.com/maptiler/tileserver-gl#getting-started-with-node)).

## Options

### A. Raster tiles from our style, behind `/api/tiles`

**How:** a render service (MapLibre Native in a container; either tileserver-gl, whose [endpoints](https://maptiler-tileserver.readthedocs.io/en/latest/endpoints.html) include `/styles/{id}/{tileSize}/{z}/{x}/{y}[@2x].{png|jpg|webp}`, or about 60 lines of Node around the module as in my script). `/api/tiles` keeps serving thumbnails; it just calls the renderer.

**Changes in the proxy (`route.ts`, `tiles.ts`):**
- Upstream becomes `${RENDERER_URL}/styles/{theme}/256/{z}/{x}/{y}.webp` (env read like `ROUTER_URL`); the OSM-policy `User-Agent` header goes. `isPhilippineTile`, the index regex, the 8 s timeout and the error shape stay.
- `Content-Type` becomes `image/webp` (or per format). Keep `s-maxage`; add a base-map version to the URL (`?v=2026-12`) so a monthly rebuild busts the CDN without waiting a week. The ADR 0003 rule "at least 7 days of caching" came from OSM's policy, not from us.
- Dark variant: add a theme segment or query to `tileUrl`; that is also a new cache key space.
- Unset `RENDERER_URL`: the map's decision is no openstreetmap.org fallback, so the proxy would answer 503, not fall back.

**Changes in `StaticTileCanvas`:** the tile loop, projection and `project` stay. Edits: theme-aware URLs (render both sets with `dark:hidden` / `hidden dark:block`, or one set swapped by CSS; whether `loading="lazy"` skips a `display:none` image is [INFERENCE: browser behaviour I did not test]); a `srcset` with `@2x` for retina (the current OSM tiles are 256 px, so the thumbnails are soft on 2x screens today); attribution text for the new tile source; `bg-muted` stays as the loading colour. Optionally 512 px tiles at zoom `Z-1`: fewer requests (2–6 instead of 3–8) but 32 KB each instead of 9 KB.

**Fidelity:** same style, same engine family as the live map; label choices differ slightly (above). **Cost:** one renderer container; about 8–11 uncached tiles/s per vCPU. **Latency:** first view of a tile = proxy hop + render (53–128 ms measured) + encode; later views are CDN hits; a card needs 3–8 tile requests, HTTP/2-multiplexed. **Ops:** a container with Xvfb + Mesa, a pinned style file, the vector tile archive from the monthly rebuild, a restart on rebuild.

### B. One image per post or guide

**B1: rendered on first view.** A route such as `/api/thumb/post/{id}` (and `/comment/{id}` for guides) reads the post's `map_data` (public rows; the Supabase server client already exists), recomputes `fitPostMapToView`/`guideMapFit` (pure TypeScript in the repo) with the same design size, renders one 560×240 image at GL zoom `Z-1`, and returns WebP with a long `s-maxage`. The key space is the number of public posts, so it cannot be scanned with arbitrary cameras (a route taking centre/zoom from the URL would be an open render endpoint, which is what `isPhilippineTile` prevents today).
- *`StaticTileCanvas`:* the tile loop and `TILE_SIZE` go; one `<img>` (with `srcset` for `@2x`) fills the box; `fit` still feeds `project`, so overlays stay pixel-exact. Because the server image is exact, the `Math.round` tile offsets disappear.
- *Proxy:* `/api/tiles` is no longer used by thumbnails; a new route replaces it. Rate limiting is per post id, not per tile.
- *Numbers:* 1 request and 22.8 KB (@1x) or 64 KB (@2x) per card as WebP [MEASURED]; the renderer does one 111 ms render per uncached post instead of 3–8 tile renders (tiles shared by neighbouring posts are cheaper than this suggests in dense areas).

**B2: rendered at publish time and stored (Supabase Storage).** Posts are inserted by the browser straight into `posts` under RLS (there are no server actions), so a render needs a trigger: a [Database Webhook](https://supabase.com/docs/guides/database/webhooks) (a `pg_net` trigger) calling the renderer or an Edge Function on `INSERT` of `posts` and `comments`, or a client call after insert. Storage follows the `avatars` bucket pattern (migration, policies, `database.types.ts` regeneration, a path or column read in `select.ts`/`types.ts`).
- *Cost:* storage is $0.0213/GB-month beyond 1 GB on Free and 100 GB on Pro ([pricing](https://supabase.com/docs/guides/storage/pricing)). At 22.8–64 KB per image, 100,000 posts is 2.3–6.4 GB per variant [INFERENCE: arithmetic; the dark variant doubles it].
- *Problems:* an image bakes the base map of its publish month, so "one look everywhere" breaks after the next monthly rebuild unless every stored image is re-rendered (and again for each style change and the dark variant). A failed or late render needs a fallback path (B1 or the tile grid), so B2 contains B1. It adds a write path, a trigger, secrets in Vault (the docs note the secret key sits in the `pg_net` queue), and a backfill job. It buys nothing the CDN does not already give for B1, since posts never change.
- *Fidelity:* same as B1; cost and ops: highest of the lot.

### C. A hosted renderer

I found none that meets "no keys, no usage billing" and renders our style:

| Service | Finding |
|---|---|
| MapTiler Static Maps | "You need a MapTiler API key"; "don't work with a free plan" ([docs](https://docs.maptiler.com/cloud/api/static-maps/)) |
| Stadia Maps Static Maps | needs a domain-auth setup or API key for non-local use; storing images needs the paid `static_cacheable` endpoint, charged per request ([docs](https://docs.stadiamaps.com/static-maps/)) |
| CARTO raster basemaps | "An API key is required"; keyless requests get a watermark; free up to 5M (non-commercial) / 1M (commercial) tiles a month ([basemap-styles README](https://github.com/CartoDB/basemap-styles)); also its own styles, not ours |
| OpenFreeMap | vector tiles only; ToS forbids automated collection beyond small offline downloads ([ToS](https://openfreemap.org/tos/)) |

All conflict with ADR 0003 ("no keyed or usage-billed services") and the first two cannot host our style without a custom-style product. **Not workable.**

### D. Keep thumbnails as they are, change only live maps

Zero code change in `StaticTileCanvas` and the proxy. Costs:
- Two looks (the owner's stated preference is one); the live map's calmer colours would not match the thumbnail the rider just tapped.
- It keeps `tile.openstreetmap.org` in the product, contradicting #32's destination. The [tile policy](https://operations.osmfoundation.org/policies/tiles/) says capacity is limited, availability is best effort with no SLA, access may be withdrawn without notice, and that it "generally do[es] not recommend" caching proxies.
- The existing proxy sends no `Referer` and puts every client behind one User-Agent; the policy's section 3.4 lists "Strip `Referer` on web traffic" and "tunnel all clients behind a single, anonymous identity" under "You must not", enforced by blocking without notice [INFERENCE: from `route.ts` vs the policy text].

### Also considered

- **Client-side from vector tiles.** One shared offscreen MapLibre GL JS map rendering each card to an image avoids many WebGL contexts, but ships `maplibre-gl` to the feed: 1,056,837 bytes, 275,098 gzip, 224,810 brotli for 5.24.0's `dist/maplibre-gl.js` [MEASURED], which `CLAUDE.md` forbids, and fetches vector tiles in the browser (the proxy rule in ADR 0003). Rejected on the repo's own rules.
- **A second renderer for the feed.** `protomaps-leaflet` draws vector tiles on Canvas 2D, but it has its own style model, not MapLibre style JSON, and is in [maintenance mode](https://github.com/protomaps/protomaps-leaflet); it breaks "one look".
- **A pre-rendered pyramid.** The Philippine bounding box (the proxy's accept range) has 537,949 tiles up to z14 and 2.14 million up to z15 [MEASURED: arithmetic over `isPhilippineTile`'s bounds]. At 9 KB each that is up to 4.8 GB through z14 (ocean tiles are far smaller), and thumbnails reach z18. On-demand plus the CDN is smaller and cheaper.

## Comparison

| | A. Tiles via `/api/tiles` | B1. Image per post on first view | B2. Image stored at publish | C. Hosted | D. Keep OSM tiles |
|---|---|---|---|---|---|
| Fidelity to live map | Same style, label choices differ slightly | Same | Same, but frozen at publish month | n/a (not workable) | Different look |
| Requests per card | 3–8 (post), 2–6 (guide) | 1 | 1 | n/a | 3–8 |
| Bytes per card (WebP, @1x) | about 27–72 KB; 3.9× over-fetch worst case | 22.8 KB (560×240) | 22.8 KB | n/a | OSM PNGs |
| Cache sharing | across posts in an area | per post | per post | n/a | across posts |
| New moving parts | renderer container | renderer container, new route | renderer, trigger, bucket, column, backfill | n/a | none |
| `StaticTileCanvas` | small edits | tile grid replaced by one `<img>` | same as B1 plus stored URL | n/a | none |
| Proxy | upstream swap, theme/version, WebP | `/api/tiles` unused by thumbnails | same | n/a | none |
| Monthly rebuild | bump `v`; tiles re-render lazily | bump `v`; same | re-render all images | n/a | none |
| Dark variant | second key space, lazy | second key space, lazy | second image per post | n/a | none |

## Things the spec still has to settle

- Where the renderer runs and how it reads the vector archive: Hosting and Sources tickets decide; my numbers assume tiles arrive over HTTP or from a local file.
- The `v` convention for cache busting after each monthly rebuild; the same constant would serve live-map style URLs.
- Attribution wording on thumbnails once the tile source is chosen (`OsmAttribution` text; the base map's schema/tile credit may be required too).
- The dark thumbnail: both sets in HTML, or the proxy picking by a cookie (a cookie would make the CDN key vary on it).
- Label placement will differ slightly between a thumbnail and the live map at the same camera; decide whether that is acceptable or whether the style should keep labels sparse enough that placement rarely matters.
- A stuck renderer must not take the feed down: the proxy's timeout and 502 are already the failure mode; the card keeps its `bg-muted` box and the SVG overlay.

## Recommendation

Not a decision.

1. **Render with MapLibre Native in a small container service, not inside the Next.js app.** It is the only option in this research that gives the live map's style at our own cost, and it provably cannot run in a standard Vercel Node function (glibc, X display, OpenGL libraries). Put it where the router runs; Next.js reaches it only through its own proxy, as ADR 0007 does for Valhalla. Use tileserver-gl if its image meets the Sources ticket's tile format; otherwise a short Node wrapper around the module (what I measured).
2. **Start with Option A (tiles behind `/api/tiles`).** The edits are the smallest: swap the proxy's upstream, add theme and version to `tileUrl`, return WebP, add a retina `srcset`, and update attribution. `StaticTileCanvas`'s geometry, the SVG overlay and ADR 0005 do not change. Tiles are shared between neighbouring posts and have a bounded key space without database access.
3. **Always encode WebP (or palette PNG), never sharp's default PNG.** That alone is a 6× byte difference per tile.
4. **Hold B1 in reserve** (`/api/thumb/post/{id}`): 1 request and up to 3.9× fewer pixels per card, and one render per uncached post. Move to it if the prototype shows feed latency or bytes are the problem; the renderer, style and version convention carry over unchanged.
5. **Do not build B2, C or D.** B2 pays for a trigger, a bucket and a re-render of every stored image each month and for the dark variant, and breaks "one look" between rebuilds. C does not exist keyless and unbilled. D keeps two looks and the OSM dependency.
6. **Run the prototype with our own style before committing numbers:** the 55-layer positron style is probably lighter or heavier than the commuter-landmark style, so rerun [Results](#results) on it.

## Not measured

- A deployment to Vercel (Container Runtime beta or any function): the AL2023 run is a container stand-in for the runtime.
- Cold start of a scaled-to-zero container host (only in-process first render, 855 ms, and Xvfb start, about 1 s).
- The final calmer style and our own vector tile archive: timings use OpenFreeMap positron.
- Native vs GL JS text anti-aliasing and sprites; the browser's behaviour for lazy `display:none` images; a real GPU instead of software GL.

## Sources

- Repo: `src/components/map/static-tile-canvas.tsx`, `static-post-map.tsx`, `map-previews.tsx`, `post-map-geometry.ts`, `osm-style.ts`; `src/lib/map/tiles.ts`; `src/app/api/tiles/[z]/[x]/[y]/route.ts`; `docs/adr/0003`, `0005`, `0007`; `docs/codemap.md`; `CLAUDE.md`.
- MapLibre Native Node: [README](https://github.com/maplibre/maplibre-native/blob/main/platform/node/README.md), [package.json](https://github.com/maplibre/maplibre-native/blob/main/platform/node/package.json), [DEVELOPING.md](https://github.com/maplibre/maplibre-native/blob/main/platform/node/DEVELOPING.md), [npm](https://www.npmjs.com/package/@maplibre/maplibre-gl-native).
- tileserver-gl: [README](https://github.com/maptiler/tileserver-gl), [endpoints](https://maptiler-tileserver.readthedocs.io/en/latest/endpoints.html), [Docker Hub tag API](https://hub.docker.com/v2/repositories/maptiler/tileserver-gl/tags?name=latest).
- Vercel: [function limits](https://vercel.com/docs/functions/limitations), [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [build image](https://vercel.com/docs/builds/build-image), [Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Running Docker on Vercel](https://vercel.com/kb/guide/docker), [Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing).
- Hosted renderers: [MapTiler Static Maps](https://docs.maptiler.com/cloud/api/static-maps/), [Stadia Static Maps](https://docs.stadiamaps.com/static-maps/), [CARTO basemap styles](https://github.com/CartoDB/basemap-styles), [OpenFreeMap ToS](https://openfreemap.org/tos/).
- OSM: [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
- Supabase: [Storage pricing](https://supabase.com/docs/guides/storage/pricing), [Database Webhooks](https://supabase.com/docs/guides/database/webhooks).
- Other: [protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet), [MapLibre style spec](https://maplibre.org/maplibre-style-spec/), `maplibre-gl@5.24.0` from npm.
