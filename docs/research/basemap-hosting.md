# Hosting a base map file in production

Research for the "Calmer base map" map ([#32](https://github.com/geadlydrim/CommuteNity-Web/issues/32)), ticket 34 ("Hosting a base map file in production"). Researched 2026-11-06. This file records facts, measurements and options with a recommendation; **it does not decide**. The question: where can one Philippines `.pmtiles` file of a few hundred MB, read by MapLibre with HTTP range requests, plus its fonts and icons, be served in production at no or very low cost, with no API keys in the browser? It compares Supabase Storage, Cloudflare R2, Vercel (static files and Blob) and serving through our own route, and notes what a hosted source such as OpenFreeMap would need from us instead.

How to read it:

- Claims link to the page or file that owns them (provider docs, pricing pages, licence and terms text, library source).
- **[MEASURED]** marks a number from my own run on 2026-11-06 (method in [Method](#method)). Only read-only requests were made. Nothing was created or uploaded in the live Supabase project, and no account was opened at any provider.
- **[INFERENCE]** marks a conclusion that no primary source states outright.
- Vocabulary follows `GLOSSARY.md`: **base map**, pin, street path, focus view. "Rider" is a person using the app. "Feed thumbnail" is the static card map of ADR 0005.
- "DAU" is daily active riders. Dollar figures are list prices on 2026-11-06 and move.
- The tile numbers come from a Protomaps tileset that a sibling ticket extracted into `~/.cache/commutenity/basemap/pmtiles/`. It stands in for "the file": the real tileset and style are decided elsewhere, and bytes per tile come from the tileset, not the style.

## Short answer

1. **Supabase Storage serves range requests, with CORS `*`, through Cloudflare's CDN, and this project's own public bucket already shows it** [MEASURED]. A `Range: bytes=0-99` request returned `206`, `Content-Range`, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin: *`, `cf-cache-status: HIT` and `x-smart-cdn: true`; an unsatisfiable range returned `416` with `Content-Range: bytes */<size>`. Two limits matter more than the protocol: **a Free project cannot hold the file** (50 MB per file; the smallest tileset I measured is 81 MB), and **the bucket cannot restrict origins**, so anyone can hotlink the file at our expense. The `x-smart-cdn: true` header suggests the live project is already on Pro, which would remove the first limit [INFERENCE: verify in the billing page].
2. **Cloudflare R2 is the cheapest at any load and the one the PMTiles docs recommend, but it costs a card and a domain.** Egress is free, the first 10 GB of storage and 10 million reads a month are free, and the 500 DAU case below costs $0. It needs a payment method on file even for the free tier, and a custom domain on a Cloudflare zone for production (the `r2.dev` URL is rate-limited and "not for production"). Whether the project owns a domain is not stated anywhere in the repo.
3. **Vercel is the weakest place for the file itself.** `public/` is capped by GitHub's 100 MiB file limit and by Vercel's 100 MB (Hobby) / 1 GB (Pro) source upload; Vercel Blob takes the file but does not cache objects over 512 MB, Hobby stops serving once its 10 GB transfer allowance is spent (the 500 DAU case uses about 36–53 GB), and Pro's included CDN capacity is 1 million requests a month, which this one file would use up alone. Vercel is the right place for the **fonts and icons** (about 0.5 MB, same origin, no CORS).
4. **Our own route can front any storage option, and is the cleanest answer to "no mixing of old and new data".** A `/api/basemap/<version>/{z}/{x}/{y}` route that reads one tile out of the file and returns it with a long `s-maxage` is the same shape as today's `/api/tiles` (ADR 0003), keeps the browser on our origin, and makes a version part of the URL. Proxying the raw `.pmtiles` with `Range` passed through is **not viable on Vercel**: its CDN does not cache requests that carry a `Range` header, so every tile would be a function call.
5. **The load is small; the egress is not zero.** With the assumptions in [Load estimate](#load-estimate) (a focus view about 21 requests and 0.75 MB; 40 KB per tile), 100 / 500 / 5,000 DAU give roughly **7 / 36 / 364 GB** a month and **0.2 / 1.0 / 10 million** range requests, before any browser cache. If the feed's thumbnails are drawn client-side from vector tiles instead of server-made images, add about half again. That is inside Supabase Pro's 250 GB cached-egress quota for the first two cases and costs about $3 above it in the third; it is $0 on R2 in the first two cases and cents in the third.
6. **Whatever the host, publish each monthly build under a new immutable name** (for example `ph-261102-<hash8>.pmtiles`, named by the Geofabrik extract date) and let the style JSON, served by our app, name the current file. A PMTiles reader caches directory byte offsets; replacing the file under the same name lets old directories point into new data. Supabase's own docs say to upload changed assets to a different path, and query-string cache busting does not work on its Smart CDN [MEASURED].
7. **OpenFreeMap would need almost nothing hosted from us** (a style JSON we write, plus attribution) but gives us none of what the destination asked for: its tiles are the whole planet's OpenMapTiles schema rebuilt weekly by them, not our monthly extract; it offers no static images; and its terms say it may be discontinued without notice.

## What "hosting" has to carry

| Artifact | Size | Access pattern |
|---|---|---|
| The `.pmtiles` | 81 MB (to z12), 166 MB (z13), **322 MB (z14)**, **762 MB (z15)** for the Protomaps tileset over bbox 116,4,127,21 [MEASURED: file sizes] | Range requests: one 16 KiB read for header and root directory, leaf directories (mean 8.9 KB, 115 of them in the z15 file) and tile bodies |
| Style JSON | about 28 KB for OpenFreeMap's Positron [MEASURED]; ours will be similar | Plain GET, changes with the build |
| Glyphs (fonts) | Noto Sans `0-255.pbf` is 76 KB raw / 46 KB gzip, `256-511` 128 / 62 KB, `8192-8447` (has the peso sign) 64 / 43 KB [MEASURED] | Plain GET per Unicode range and font |
| Sprites (icons) | `light.png` 16 KB, `light@2x.png` 29 KB, plus 3.5 KB JSON each; `dark` is the same size [MEASURED, Protomaps assets repo] | Plain GET at map load |

Three facts in this table steer everything below:

- **The reader's first request is `bytes=0-16383`** ([pmtiles-js `getHeaderAndRoot`](https://github.com/protomaps/PMTiles/blob/main/js/src/index.ts)); every later request is `bytes=a-b` with a single range. The Fetch spec lists a single `bytes=start-end` `Range` as a CORS-safelisted request header ([Fetch §2.2.2](https://fetch.spec.whatwg.org/#cors-safelisted-request-header)), so **no preflight is needed**, and the host's CORS answer reduces to `Access-Control-Allow-Origin`.
- **The reader reads the response `ETag`** to notice that the file changed under it, and ignores weak ETags. From another origin the browser hides `ETag` unless the server sends `Access-Control-Expose-Headers: ETag`. The pmtiles source comment says "CORs configuration should expose ETag" ([source](https://github.com/protomaps/PMTiles/blob/main/js/src/index.ts)). Neither Supabase nor Vercel Blob sent that header in my requests [MEASURED], so on those two the reader cannot see a replaced file; only immutable names keep it safe (see [Publishing a monthly replacement](#publishing-a-monthly-replacement)).
- **File size decides caching.** Cloudflare's cache refuses files over 512 MB on Free, Pro and Business plans ([cacheable size limits](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/#cacheable-size-limits)), and Vercel Blob does not cache over 512 MB either ([Blob size limits](https://vercel.com/docs/vercel-blob/usage-and-pricing#size-limits)). The 322 MB z14 file fits; the 762 MB z15 file does not. Supabase's Storage CDN is Cloudflare-fronted (`server: cloudflare`, `cf-ray` [MEASURED]), but its docs do not state a cache size limit, and I could not test one without uploading [INFERENCE: it may be the same 512 MB]. Keeping the file under about 500 MB is the safe design target.

## Load estimate

Assumptions (all mine; change them and re-run the arithmetic):

- **Tiles per map view.** MapLibre draws 512 px vector tiles. A phone viewport (about 390 × 700 CSS px) at the zooms that fit a leg or a short route (z12–14) needs 4–6 tiles; I use **6 for the first paint** of a focus view, then **3 interactions of 4 new tiles each**. That is 18 tile requests. Add one header read and two leaf directory reads (`16.4 KB + 2 × 8.9 KB`) for a map that has not been opened before in this browser: **21 requests and about 0.75 MB** per focus view. A builder session, which pans and zooms a lot, I set at 40 tiles: **43 requests and 1.6 MB**.
- **Bytes per tile: 40 KB** (gzip, as stored). In Metro Manila, mean gzip tile size is 64 KB at z12, 37 KB at z13, 25 KB at z14 and 30 KB at z15 (median 15–18 KB at z14–15); the whole-country mean at z14 is 0.47 KB, pulled down by the many near-empty sea and rural tiles [INFERENCE for the reason] [MEASURED for the numbers: 1,344 z15 tiles in a 0.3° × 0.5° box around Manila]. A calmer tileset with fewer places will be smaller, so 40 KB errs high.
- **Views per rider per day:** 3 focus views, 0.1 builder sessions, 1.5 feed loads. The feed (ADR 0005) shows static images, so it adds nothing here if thumbnails are made by our server or at build time (**scenario A**). If thumbnails are drawn client-side from vector tiles (**scenario B**, an open question for the thumbnails ticket), I add 25 requests and 0.75 MB per feed load, net of browser cache.
- **Riders:** 100 DAU (launch), 500 DAU (a healthy small community), 5,000 DAU (a 10× success).
- **No browser or CDN cache discount** in the totals. Repeat views of the same Manila tiles will be cheaper, so these are upper bounds on bytes. CDN hit ratio only changes *which* meter the bytes land on.

| | 100 DAU | 500 DAU | 5,000 DAU |
|---|---|---|---|
| A: requests per day | 6.7 k | 33.7 k | 336 k |
| A: requests per month | 0.20 M | 1.01 M | 10.1 M |
| A: egress per month | 7.3 GB | 36 GB | 364 GB |
| B: requests per day | 10.5 k | 52 k | 524 k |
| B: requests per month | 0.31 M | 1.57 M | 15.7 M |
| B: egress per month | 10.7 GB | 53 GB | 533 GB |

Monthly cost per option at those loads (marginal, on top of the fixed plan; method in [Method](#method)):

| Option | 100 DAU | 500 DAU | 5,000 DAU | Fixed cost / gate |
|---|---|---|---|---|
| **Supabase Storage** (public bucket, Pro) | $0 | $0 | A: about $3; B: about $8 (cached egress over 250 GB at $0.03/GB) | Pro $25/month; Free cannot hold the file |
| **Cloudflare R2**, no CDN cache | $0 | $0 | A: $0.36; B: $2.16 (reads over 10 M, rounded up to whole millions at $0.36/M) | A card; a domain on a Cloudflare zone |
| R2 behind a Worker that serves `z/x/y` | $0 | $0 (34–52 k Worker requests/day, under the free 100 k) | $5.03–6.71 (Workers Paid $5 + $0.30/M over 10 M) | As above |
| **Vercel Blob**, Hobby | $0 if A (7 GB), over 10 GB if B | **Blob stops serving** for 30 days (36–53 GB against 10 GB) | same | Non-commercial use only |
| Vercel Blob, Pro | about $0 within the $20 credit | $0–20 (Flat Rate CDN's 1 M requests is exceeded in B and met in A) | about $40–120 [INFERENCE: tier table or on-demand rates, see below] | Pro $20/month |
| **Vercel `public/`**, Hobby | $0 | $0 (36–53 GB of 100 GB) | exceeds 100 GB | Cannot hold the file (see below) |
| **Own route** `z/x/y` on Vercel over Supabase or R2 | the storage row, plus invocations (a few tens of thousands, free) | same | plus CDN-request and transfer meters as above | Needs storage behind it |
| Own route proxying raw `Range` | 0.2 M invocations | 1.0–1.6 M invocations (Hobby allows 1 M) | 10–16 M invocations, about $6–10 plus CPU and origin transfer | Not cacheable on Vercel's CDN |
| **Own server** (go-pmtiles or nginx on a VPS) | VPS price | VPS price | VPS price | Undecided where the router runs (ADR 0007) |

## Supabase Storage

**What the live project showed [MEASURED].** The repo has one public bucket, `avatars` (`supabase/migrations/20260601120000_avatar_storage.sql`). I requested one existing avatar object by its public URL, with no API key, from this workstation:

| Request | Result |
|---|---|
| `GET` with `Range: bytes=0-99` | `206`, `content-length: 100`, `content-range: bytes 0-99/127942`, `accept-ranges: bytes`, `etag`, `last-modified`, `cache-control: public, max-age=3600`, `access-control-allow-origin: *`, `cf-cache-status: HIT`, `x-smart-cdn: true`, `server: cloudflare` |
| Any other range on the same object | `206` with the matching `content-range`, also `HIT` |
| A range request with a random, never-seen query string, four times | all `206`, all `HIT`: the CDN key ignores unknown query parameters, as the Smart CDN doc says ("even when different query strings are used") |
| Range past the end (`bytes=999999-1000000`) | `416`, `content-range: bytes */127942` |
| `GET` with `If-None-Match` | `304` |
| `OPTIONS` preflight with `Access-Control-Request-Headers: range` | `200`, `access-control-allow-origin: *`, `access-control-allow-headers: range`, `access-control-max-age: 3600` |
| `HEAD` | `200`, `cache-control: private, no-cache`, `cf-cache-status: DYNAMIC`: HEAD is not cached; pmtiles-js never sends it |
| Any response with an `Origin` header | no `access-control-expose-headers`, so `ETag` is unreadable to cross-origin JavaScript |

So the protocol is fine. I could not test a hundreds-of-MB object: that would need an upload, which I was told not to do. Untested, and the part that could still surprise: how a cold range request behaves on a very large object (Cloudflare's cache fetches a whole file from the origin on a miss unless its "Origin Range Requests" setting is on, and whether Supabase enables that is not documented; [Cloudflare range behaviour](https://developers.cloudflare.com/cache/reference/range-requests/)), and whether Supabase caches objects over 512 MB. The Protomaps docs list Supabase as supporting range requests and public-bucket CORS `*`, and say restricting origins is only possible through an Edge Function proxy in front of a private bucket ([PMTiles cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage#supabase-storage)); the `*` and the absent expose header are consistent with what I saw.

**Limits and cost.**

- **File size:** 50 MB per file on Free, 500 GB on Pro and Team; the per-bucket limit cannot exceed the global one ([file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)). Every file I measured, even the z12 one (81 MB), is over the Free cap. **Free storage is 1 GB**, Pro 100 GB ([pricing](https://supabase.com/pricing)). Free projects also pause after a week of inactivity, which would blank the base map.
- **Egress:** a unified quota per plan, with cached and uncached egress counted separately: Free 5 GB / 5 GB, Pro 250 GB / 250 GB, then $0.03 per GB cached and $0.09 per GB uncached ([egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)). Supabase does not bill per request. Range-served CDN hits are the "cached" meter. The 500 DAU load is 36–53 GB, a fifth of the Pro quota, shared with database and auth egress (small today).
- **Is the project on Pro?** The `x-smart-cdn: true` header appeared on the project's responses, and Smart CDN is "automatically enabled for Pro Plan and above" ([Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn)). That points to Pro, but the repo never says; check Billing before relying on it [INFERENCE].
- **Blast radius.** Exceeding a quota with the spend cap on (Pro default), or on Free, triggers the Fair Use Policy, and its restrictions are applied to the whole organisation: pausing projects, read-only databases, `402` on all API requests ([billing FAQ](https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy)). A map-tile spike or a scraper could therefore take the database down. Options: a separate Supabase organisation or project just for the base map (another $25/month on Pro), or turn the spend cap off and rely on alerts. The same document says the cap is the only protection, since the bucket's CORS cannot be narrowed.

**CORS.** Public buckets answer `*` and cannot be narrowed (see the PMTiles doc above). That is acceptable for read-only open map data; the exposure is egress cost, not secrets.

**Caching headers.** Default `cache-control: public, max-age=3600` as seen above. The upload sets it: the S3 `PutObject` and `CreateMultipartUpload` calls accept `Cache-Control` ([S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)), so upload with `public, max-age=31536000, immutable` for a versioned name.

**Publishing.** Storage takes standard, resumable and S3 uploads, and all are interoperable. S3 access keys "provide full access to all S3 operations across all buckets and bypass RLS" and are for server use only; use the direct hostname `<ref>.storage.supabase.co` for large uploads ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)). `rclone` and the `pmtiles upload` command both work against S3-compatible stores ([PMTiles cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage)). Smart CDN invalidates changed or deleted assets in up to 60 seconds but browsers keep their copy for the object's TTL, so the doc itself advises "upload the new asset to a different path" for frequently updated assets. S3 versioning is not supported, and deleted objects cannot be restored. A new bucket needs a migration under `supabase/migrations/` (the repo convention, and the avatars bucket was made that way); a public bucket "bypasses access controls" for reads while uploads, deletes and moves stay under access control ([bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)), so no write policy is needed at all if only the S3 key writes.

**ADR 0003.** No API key in the browser (the public URL needs none). It is a usage-billed provider, but only beyond a 250 GB quota that a spend cap turns into a stop rather than a bill. No usage policy is broken, as the PMTiles docs themselves list Supabase as a supported host. It satisfies the intent if the project is on Pro.

## Cloudflare R2

- **Limits:** an object may be up to 5 TiB; 4.995 GiB per single-part upload and 4.995 TiB multipart ([R2 limits](https://developers.cloudflare.com/r2/platform/limits/)). Upload with `rclone copyto ... --s3-chunk-size=256M`, `aws s3` or `pmtiles upload` ([PMTiles cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage)).
- **Cost:** storage $0.015/GB-month, Class A (writes, lists) $4.50/M, Class B (reads) $0.36/M, **egress free**; free each month: 10 GB storage, 1 M Class A, 10 M Class B. Usage rounds up to the next billing unit ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Each range GET is one Class B operation, which is why the Protomaps docs call per-request fees the cost to understand. At 500 DAU the base map is $0; at 5,000 DAU it is $0.36–2.16 without any cache.
- **Card required.** "You need a Cloudflare account with an R2 subscription" ([get started](https://developers.cloudflare.com/r2/get-started/)); the checkout flow asks for a card even for the free tier, and usage over the allowance is billed, not capped, as a Cloudflare community answer says ([thread, 2026-08-03](https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179)). That is a community-forum source, not Cloudflare documentation. It matters to ADR 0003's "no usage-billed service" wording: R2 is usage-billed with no hard cap, though the amounts are cents.
- **Public access.** `r2.dev` is "for non-production use cases", rate-limited with "hundreds of requests/second" throttling and possible bandwidth throttling ([limits](https://developers.cloudflare.com/r2/platform/limits/#rate-limiting-on-managed-public-buckets-through-r2dev)). Production needs a **custom domain on a Cloudflare zone in the same account**; if the domain's DNS is elsewhere, "partial (CNAME) setup" is **Business or Enterprise only** ([partial setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)), so in practice the domain (or a subdomain's whole parent) moves its nameservers to Cloudflare. Whether the project owns a domain is not in the repo (`commutenity.app` appears only as a placeholder in `.env.example`). A custom domain also unlocks Cloudflare caching, WAF and rate-limit rules, none of which work on `r2.dev` ([public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)).
- **CORS:** configurable per bucket, including exact origins. For PMTiles use allowed headers `range` and `if-match`, methods `GET`/`HEAD`, and `exposeHeaders: ["etag"]` (Protomaps example; [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)). This is the only option here where we can limit origins **and** expose `ETag`. CORS headers appear only on requests that carry an `Origin`.
- **Caching:** off by default for `.pmtiles`. Cloudflare caches only listed extensions (not `.pmtiles`), so a **Cache Rule ("cache everything")** on the domain is needed; the 512 MB cacheable-file cap applies ([default behaviour](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)). Cloudflare can serve ranges from a fully cached file ([range behaviour](https://developers.cloudflare.com/cache/reference/range-requests/)). Without that rule, every range is a Class B read (cheap, but slower).
- **Terms.** Cloudflare's CDN terms say large files and a disproportionate share of non-HTML content must use a paid Developer Platform service such as R2 rather than the bare CDN ([service-specific terms](https://www.cloudflare.com/service-specific-terms-application-services/)). R2 is on that platform, so serving the file from R2 is the compliant path; proxying the same file from some other origin through Cloudflare's free CDN would not be [INFERENCE: reading of the terms].
- **Large-file latency.** OpenFreeMap's author wrote that on Cloudflare "range requests in 90 GB files have terrible latency" ([README](https://github.com/hyperknot/openfreemap#what-about-pmtiles-and-using-the-cloud)). Ours is about 300 times smaller; I did not measure R2.
- **Publishing:** immutable names as for Supabase; R2's S3 `PutObject` and `CreateMultipartUpload` accept `Cache-Control` ([S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)). Two or three retained versions stay under the free 10 GB.
- **A Worker alternative.** A Worker that decodes PMTiles and serves `z/x/y` avoids the ETag question and range handling; it counts against Workers' free 100,000 requests a day, or $5/month plus $0.30 per million beyond 10 M ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). It adds code we would have to run.
- **ADR 0003:** no key in the browser; usage-billed in cents with no cap and a card on file; no policy broken. It meets the intent only loosely on "no usage-billed service", and clearly on cost.

## Vercel

The repo never says where the app is deployed. `src/app/api/tiles/.../route.ts` sets `maxDuration` and an `s-maxage` plus `stale-while-revalidate` cache header, which are the Vercel idiom [INFERENCE]; this section reads the options as if it is.

**Static file in `public/`.**

- GitHub blocks files over 100 MiB ([GitHub docs](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)), so a 322 MB file needs Git LFS or a build step that downloads it, and then it is part of every deployment. Vercel's CLI source upload is capped at 100 MB (Hobby) / 1 GB (Pro) ([limits](https://vercel.com/docs/limits#static-file-uploads)).
- Range works on Vercel static files: a `Range: bytes=0-99` request to a 15 KB `_next/static` asset on nextjs.org returned `206`, `accept-ranges: bytes`, `x-vercel-cache: HIT` [MEASURED; small file only, a large one was not tested].
- Replacement means a new deployment, and the old tab's file path is gone unless old versions are also shipped (which doubles the deployment).
- Vercel's CDN cacheable-response rules include "request doesn't contain `Range` header" and "response doesn't exceed 10 MB" ([cacheable criteria](https://vercel.com/docs/caching/cdn-cache#cacheable-response-criteria)). These are written for dynamic responses; whether a 300 MB static file with `Range` is served from the edge cache or fetched from the deployment each time is not documented [INFERENCE: I would not rely on it].
- Hobby is for non-commercial use ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Hobby includes 100 GB of Fast Data Transfer a month.

**Vercel Blob (public store).**

- Max blob 5 TB; **cache only up to 512 MB**, so a bigger blob "will always be served from the origin" and each access is a cache miss with a Simple Operation and Fast Origin Transfer charge ([public storage](https://vercel.com/docs/vercel-blob/public-storage), [size limits](https://vercel.com/docs/vercel-blob/usage-and-pricing#size-limits)). The z14 file fits, the z15 file does not.
- Hobby: 1 GB storage, 10,000 simple operations, 2,000 advanced operations, 10 GB blob data transfer; past that "you will not be able to access Vercel Blob" for 30 days. Pro: usage-based, Blob Data Transfer $0.05–0.117/GB by region, simple operations $0.35–0.56/M ([Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), [regional pricing](https://vercel.com/docs/pricing/regional-pricing)).
- Range and CORS on a public Blob object [MEASURED on another team's public object, `*.public.blob.vercel-storage.com`]: `206`, `accept-ranges: bytes`, `content-range`, `access-control-allow-origin: *`, `etag`, `cache-control: public, max-age=2592000`, `x-vercel-cache: HIT`. `OPTIONS` returned `405` and `access-control-allow-headers: content-type`; that is harmless for pmtiles-js because a simple `Range` needs no preflight, but a custom header would break. No `access-control-expose-headers`.
- Browsers keep a Blob for the cache max-age (default one month, minimum 60 s) ([public storage](https://vercel.com/docs/vercel-blob/public-storage#caching)); a monthly replacement needs a new pathname, not an overwrite.
- A WAF can rate-limit or block hotlinking on a protected Blob store (same page), unlike Supabase Storage.
- **Flat Rate CDN (Pro).** Pro bundles 1 million CDN requests and 1 TB a month in a fixed tier, then $20 (10 M), $100 (50 M), $300 (150 M); it covers CDN requests, Fast Data Transfer and Blob Data Transfer. Its eligibility text excludes "bulk file distribution", "use of the CDN as a storage or file hosting system" and workloads where "high-volume data transfer is the primary function" ([Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn)). Vector tiles are application data, but a large share of this app's bytes would be this one file; Vercel decides eligibility, so that is a risk, not a ban [INFERENCE]. Every range request is a CDN request, so one popular map exhausts the same 1 M that the pages, scripts and API also use.
- **ADR 0003:** Hobby is a hard stop, not a bill; Pro is usage-billed. No key in the browser. The Hobby non-commercial rule is the policy to watch.

**Our own route.** Three shapes:

1. **Tile route over remote storage** (`/api/basemap/<version>/{z}/{x}/{y}`, a function that reads one tile from the file in Supabase or R2 with the `pmtiles` library, returns `application/vnd.mapbox-vector-tile` with `Cache-Control: public, s-maxage=…, immutable`). Same shape as today's `/api/tiles`, same-origin (no CORS, no ETag question), Philippines-bounded by the existing `isPhilippineTile` check, and the version is part of the URL. Each response is an ordinary cacheable response of tens of KB, well under the 10 MB limit; invocations are cache misses only. At 95% edge hit [assumed], 500 DAU is 50–79 thousand invocations a month, against 1 M free on Hobby and $0.60 per million beyond ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Costs that remain: it is still a CDN request and a transfer on every tile (same meters as the static options), and Vercel's CDN is segmented by region ([limits](https://vercel.com/docs/caching/cdn-cache#limits)), so each region warms separately. The storage meters of Supabase or R2 are used only on misses. Standing code: a PMTiles reader in a route, and the file's storage.
2. **Raw `.pmtiles` proxy with `Range` pass-through.** "Request doesn't contain `Range` header" is a cacheability condition, so every tile request is a function invocation plus origin transfer; 1.0–1.6 M invocations a month at 500 DAU and past Hobby's 1 M. I would not.
3. **Own server** (`pmtiles serve` from go-pmtiles, which serves a ZXY API from a local file or bucket, or nginx/Caddy for the raw file; [serve docs](https://docs.protomaps.com/pmtiles/cli#serve)). The docs recommend running it behind a CDN or reverse proxy. The router already needs a server in production and ADR 0007 says where is "still undecided"; co-hosting would be nearly free on disk, but it adds an always-on process, TLS, CORS, and the same cache-rule and 512 MB considerations if Cloudflare fronts it.

## Fonts and icons

Small enough that the file's host is irrelevant: the glyph ranges the Philippines needs (Basic Latin with ñ, Latin Extended-A, the punctuation block with ₱) at two or three weights come to roughly 0.4–0.6 MB gzip (three ranges at 43–62 KB each; only Regular was measured), and the sprite sheets 16–29 KB each [MEASURED, from [`protomaps/basemaps-assets`](https://github.com/protomaps/basemaps-assets); Noto Sans is under the [OFL](https://github.com/protomaps/basemaps-assets/blob/main/fonts/OFL.txt), the sprites derive from MIT-licensed Tangram icons].

- **Recommended:** commit the subset to `public/` (for example `public/map/fonts/{fontstack}/{range}.pbf`, `public/map/sprites/light*`, `dark*`) and set `glyphs` and `sprite` in the style to same-origin URLs. No CORS, no extra DNS, no extra provider, cached by the same CDN as the app, versioned with the app. `next.config.ts` already sets headers, so an immutable `Cache-Control` for that path fits the existing pattern.
- **Do not point production at Protomaps' GitHub Pages copy** (`protomaps.github.io/basemaps-assets`, which answered `cache-control: max-age=600` [MEASURED]) or OpenFreeMap's `tiles.openfreemap.org/fonts`: a third party we do not control, the same reason ADR 0003 keeps browsers off public demo servers.
- **If everything lives in one bucket,** the same files can be uploaded beside the tiles; Supabase's `*` CORS and R2's CORS policy cover them.

## Publishing a monthly replacement

What goes wrong if the file is overwritten in place: a PMTiles archive is read through byte offsets held in directories; a client holding old directories and fetching ranges from a new file gets wrong bytes. The reader's guard (the `ETag` compare) only works where `ETag` is exposed (R2 with the CORS above, or our own route), and caches add delay: Smart CDN takes up to 60 s to invalidate, browsers keep the old copy until `max-age` ends, and Cloudflare serves a cached file regardless until its TTL ends. The design below works the same on every host:

1. **Name by input, never overwrite.** `ph-<extract date>-<hash8>.pmtiles`, for example `ph-261102-3fa91c0e.pmtiles` from `philippines-261102.osm.pbf` (the router script already names the extract this way, `scripts/router/download.sh`). The same date stamps the router tiles and the rail file, so one monthly run is one version.
2. **Upload with a one-year `immutable` cache header** (Supabase and R2 both accept `Cache-Control` on upload; Blob has a cache max-age option).
3. **Verify before switching:** `HEAD` or a ranged `GET` of the first 16 KiB returns `206` and a `PMTiles` magic number; open one Manila tile.
4. **Switch with a pointer our app owns.** The style JSON (a route, or a server-rendered value) names the current file URL from a server environment variable read per request, like `ROUTER_URL` today (`docs/codemap.md`, Routing). Changing it needs a variable edit, not a build; a baked-in `NEXT_PUBLIC_` value would need a redeploy. A map that mounts after the switch uses the new file, and each map keeps one file for its whole life, so a rider never mixes two.
5. **Keep the previous file for a grace window** (I suggest 14 days) for tabs opened before the switch, then delete it. A tab that outlives the window shows no base map under its pins and street paths (the tile requests fail), which is a degraded, not broken, view.
6. **With the tile route (shape 1 above),** the version is in the tile URL and the grace window is the same TTL; nothing in the browser holds directory offsets at all.

Storage for two or three versions of a 322 MB file is under 1 GB: inside Supabase Free's storage quota (but not its file cap), Pro's 100 GB, and R2's 10 GB.

## OpenFreeMap instead

What it asks of us:

- **A style JSON we host.** The default styles (Positron, Bright, Liberty, Dark, Fiord, 3D) work by URL, but a customised style "need[s] to host the style JSON yourself" ([quick start](https://openfreemap.org/quick_start/)). Their Positron style is a 28 KB document pointing at `https://tiles.openfreemap.org/planet` (TileJSON), `…/fonts/{fontstack}/{range}.pbf` and `…/sprites/ofm_f384/ofm` [MEASURED]. We would write the calmer style and the dark variant and host them in the app.
- **Attribution:** "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"; MapLibre adds it automatically, and the OpenFreeMap part is optional ([OpenFreeMap home](https://openfreemap.org/)).
- **No key, no limit, no cost** to the public instance: "no limits on the number of map views or requests", no registration, no cookies, funded by donations; they ask for sponsorship ([README](https://github.com/hyperknot/openfreemap)). Their terms forbid "collect[ing] data from the service in automated ways" except capped offline downloads, so a server-side thumbnail renderer that fetches many tiles would need to ask them first [INFERENCE: whether that counts as "automated collection" is their call] ([terms](https://openfreemap.org/tos/)).
- **What we would not get:** a tileset we control. The schema is "unmodified OpenMapTiles" (layers `boundary`, `place`, `poi`, `transportation`, `water`, etc.), the tiles are the weekly planet build with `maxzoom` 14, and the README lists as non-goals "static image generation" and "custom tile or dataset hosting" [MEASURED: TileJSON]. That conflicts with two decisions on the map: a rebuild "from the same extract as the router", and an exact commuter-landmark list and barangay names (whatever OpenMapTiles carries is what we get). Feed thumbnails are still ours to make.
- **Service risk:** "provided as-is", "we may discontinue [the Site] at any time without notice" ([terms](https://openfreemap.org/tos/)). With "no openstreetmap.org fallback" decided for production, that is a single point of failure outside our control; mitigations are a self-hosted copy (their repo is open, and it publishes weekly planet PMTiles, which is 90 GB class, not what we want) or falling back to the first-party file in this document.
- **ADR 0003:** it satisfies "no key, no usage-billed service", and it is a public service with no policy against browser use. Whether the browser calls it directly or through our proxy is a choice; the ADR's reasons for a proxy (usage policy, one cache) do not apply to a service built for browsers.

OpenFreeMap is best read as a **fallback or prototype source** (a calm style can be built and judged against its tiles today at zero hosting), not as the production answer to this ticket.

## Comparison

| | Supabase Storage | Cloudflare R2 | Vercel `public/` | Vercel Blob | Own route over remote file | Own server |
|---|---|---|---|---|---|---|
| Holds a 322 MB file | Pro only | Yes | Poorly (GitHub 100 MiB, deploy size) | Yes | Needs storage behind it | Yes |
| Range requests | Yes [MEASURED, small] | Yes (documented) | Yes [MEASURED, small] | Yes [MEASURED, small] | n/a: serves `z/x/y` | Yes |
| CORS | `*` only | Per-origin, exposes ETag | App origin: none needed | `*`; preflight 405 | Same origin | You configure it |
| Hotlink control | None | WAF, rate limit | Vercel firewall | WAF | Existing `isPhilippineTile` bounds | You configure it |
| Cache headers | Set per object at upload | Cache Rule needed | Platform, `next.config` | Per upload | Per response | You configure it |
| Cost at 500 DAU | $0 on Pro | $0 | $0 on Hobby | Hobby blocked; Pro $0–20 | storage row + free invocations | VPS |
| Needs a card / plan | Pro $25 | Card, domain on Cloudflare | none (Hobby) | none (Hobby) | as storage | VPS |
| Replacement | New object name | New object name | New deployment | New pathname | New URL prefix | New file name |
| ADR 0003 intent | Yes on Pro (capped) | Mostly (uncapped cents) | Hobby: non-commercial rule | Hobby: hard stop | Yes | Yes |

## Recommendation

Not a decision; this is what the evidence supports.

1. **Host the `.pmtiles` on the cheapest provider that satisfies the file-size, CORS and card constraints: R2 if the owner has (or will put) a domain on Cloudflare and accepts a card on file; Supabase Storage if the live project is already Pro.** Among the hosted-storage options, R2 has the only per-origin CORS with `ETag` exposed, free egress, a WAF for hotlinking, and cents of cost at 10× the expected load. Supabase wins on being already in use, needing no new account or domain, and (probably) already paid for; its costs are no origin control, no hotlink defence, and the shared-quota blast radius. If Supabase is the choice, put the base map in its own project or confirm the spend-cap policy first.
2. **Keep the file under about 500 MB** (the z14 tileset is 322 MB; z15 is 762 MB). Both Cloudflare-based caches and Vercel Blob decline to cache above 512 MB, and a big file with cold range requests is where the unmeasured latency risk sits.
3. **Prefer a same-origin tile route over remote file access if the thumbnails ticket needs server-side reading anyway.** A `/api/basemap/<version>/{z}/{x}/{y}` route reuses the proxy design of ADR 0003, removes the CORS and ETag concerns, and makes the version a URL segment. Skip it if the thumbnails ticket picks client-side pmtiles reads (scenario B), where the browser reads the file directly.
4. **Put fonts and icons in `public/`**, same-origin and versioned with the app (about 0.5 MB).
5. **Publish each month under a new immutable name stamped with the extract date, switch a server-side pointer after verifying, and keep the previous file for about two weeks** (steps in [Publishing a monthly replacement](#publishing-a-monthly-replacement)).
6. **Do not use Vercel for the file, and do not proxy raw `Range` through a function.**
7. **Use OpenFreeMap as the zero-hosting prototype source while the style is built**, not as production.

Open points this research did not settle:

- Whether the live Supabase project is on Pro, and whether Supabase's CDN caches objects over 512 MB (needs an upload to test).
- Cold-range latency of a 300 MB object on Supabase and R2 (not measured; would need a test upload to a scratch bucket).
- Whether the project has a domain, and where the app and the router are deployed (ADR 0007 leaves the router open).
- The thumbnails ticket's choice (scenarios A and B change the load by about 50%).
- Real traffic: every figure here is an assumption until a week of production logs exists.

## Method

- **Supabase range, CORS and cache test:** read the public avatar URL of an existing user (`users.avatar_url` through the project's anon key, which is public client configuration) and ran `curl -s -D - -H "Range: …"`/`-X OPTIONS`/`HEAD` against `https://<ref>.supabase.co/storage/v1/object/public/avatars/<uid>/<file>` on 2026-11-06 from Manila (`cf-ray` suffix `MNL`). Nothing was written; no bucket was created. The project reference and the response cookie header are omitted here.
- **Vercel static test:** `curl -H "Range: bytes=0-99"` against a first-party static asset of nextjs.org (served by Vercel). **Vercel Blob test:** the same, plus `OPTIONS`, against a public Blob object on another team's store (`*.public.blob.vercel-storage.com`). Both objects are small; they show protocol behaviour only.
- **Tile sizes:** read-only walk of the directory tree of `protomaps-20261105-ph-z15.pmtiles` (762,523,910 bytes; bbox 116,4,127,21; header: 469,160 tile entries, 2,127,849 addressed tiles, root directory 566 bytes, 115 leaf directories totalling 1,020,855 bytes) with the Python `pmtiles` package in a throwaway virtual environment under `~/.cache/commutenity/basemap/hosting-venv/`. Per-tile gzip length is the directory entry's `length`. "Manila" is the box 120.90–121.20 E, 14.35–14.85 N. Per-zoom means for that box (bytes, gzip): z10 78,662; z11 52,227; z12 64,339; z13 36,875; z14 25,289; z15 29,560.
- **File sizes:** `ls -l` on the four tilesets (z12 80,986,675; z13 166,260,823; z14 322,494,347; z15 762,523,910 bytes).
- **Load model:** `focus` = 1 header + 2 leaf + 18 tile requests, `16.384 + 2 × 8.9 + 18 × 40` = 754 KB; `builder` = 1 + 2 + 40 requests, 1,634 KB; `feed` (scenario B) = 25 requests, 750 KB; per rider per day 3 focus, 0.1 builder, 1.5 feed; 30-day month. The cost rows apply the published rates cited above; "about $3" is `(364 − 250) × 0.03`, "$8" is `(533 − 250) × 0.03`, assuming every byte is a cache hit. On Vercel Pro, "$40–120" is Pro's $20 platform fee plus the next Flat Rate CDN tier ($20 for 10 M requests, $100 for 50 M) when the monthly request count passes the tier, or the on-demand Blob Data Transfer rate ($0.05–0.117/GB) plus CDN requests ($2.00–3.20 per million) if Flat Rate CDN is off [INFERENCE: I did not find which request allowance applies to on-demand Blob traffic].
- **Not done:** no uploads, no account at R2 or Vercel, no browser test of MapLibre against any host, no latency test of a large object, no power-user or low-end-phone measurement.
- The scratch scripts and virtual environment are outside the repo and not part of this change.

## Sources

- **Supabase:** [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Pricing](https://supabase.com/pricing), [Billing FAQ and Fair Use Policy](https://supabase.com/docs/guides/platform/billing-faq), [Billing overview](https://supabase.com/docs/guides/platform/billing-on-supabase), [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), [Bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Serving assets](https://supabase.com/docs/guides/storage/serving/downloads), [Creating buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Storage optimizations](https://supabase.com/docs/guides/storage/production/scaling)
- **Cloudflare:** [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 get started](https://developers.cloudflare.com/r2/get-started/), [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [community thread on card requirement](https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179), [default cache behaviour and size limits](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/), [range request behaviour](https://developers.cloudflare.com/cache/reference/range-requests/), [partial (CNAME) setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [CDN service-specific terms](https://www.cloudflare.com/service-specific-terms-application-services/)
- **Vercel:** [Limits](https://vercel.com/docs/limits), [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), [CDN cache](https://vercel.com/docs/caching/cdn-cache), [Blob pricing and limits](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Blob public storage](https://vercel.com/docs/vercel-blob/public-storage), [Regional pricing](https://vercel.com/docs/pricing/regional-pricing), [Pro plan](https://vercel.com/docs/plans/pro-plan), [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn)
- **PMTiles and Protomaps:** [PMTiles concepts](https://docs.protomaps.com/pmtiles/), [Cloud storage for PMTiles](https://docs.protomaps.com/pmtiles/cloud-storage), [PMTiles CLI (serve)](https://docs.protomaps.com/pmtiles/cli), [PMTiles for MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre), [pmtiles-js source](https://github.com/protomaps/PMTiles/blob/main/js/src/index.ts), [basemaps-assets](https://github.com/protomaps/basemaps-assets)
- **OpenFreeMap:** [Quick start](https://openfreemap.org/quick_start/), [Terms of service](https://openfreemap.org/tos/), [Home and attribution](https://openfreemap.org/), [README](https://github.com/hyperknot/openfreemap), [TileJSON](https://tiles.openfreemap.org/planet), [Positron style](https://tiles.openfreemap.org/styles/positron)
- **Other:** [Fetch standard, CORS-safelisted request-header](https://fetch.spec.whatwg.org/#cors-safelisted-request-header), [GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- **In this repo:** `docs/adr/0003-maplibre-osm-nominatim-proxy.md`, `docs/adr/0005-static-feed-thumbnails.md`, `docs/adr/0007-self-hosted-valhalla-for-street-paths.md`, `docs/codemap.md` (Maps, Routing), `src/lib/map/tiles.ts`, `src/app/api/tiles/[z]/[x]/[y]/route.ts`, `supabase/migrations/20260601120000_avatar_storage.sql`, `scripts/router/download.sh`, `.env.example`
