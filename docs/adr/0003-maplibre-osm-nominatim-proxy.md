# MapLibre with OSM tiles; Nominatim behind our own proxy

Maps render with MapLibre GL over OpenStreetMap raster tiles, and geocoding goes through Nominatim, called only from our server routes (`/api/geocode`, `/api/geocode/reverse`). We rejected Google Maps and Mapbox because both bill by usage after a free tier and need API keys. Routing every Nominatim call through our server lets us honor its usage policy (an identifying User-Agent, 1 request per second) and cache results in one place; browsers never call Nominatim directly.

## Consequences

- The throttle only covers a single server instance; heavy traffic means moving to Photon, a self-hosted geocoder, or a paid one.
- Any future routing service (for example, street paths) follows the same rule: a server-side proxy, never a browser call to a public demo server.
- Map tiles, for static thumbnails and live maps alike, load through our caching tile proxy (`/api/tiles/{z}/{x}/{y}`, URL from `src/lib/map/tiles.ts`), which serves only zoom 0–19 tiles over the Philippines and honors OSM's tile usage policy: an identifying User-Agent and at least 7 days of browser and CDN caching. Browsers never request tile.openstreetmap.org directly.
