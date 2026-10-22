# MapLibre with OSM tiles; Nominatim behind our own proxy

Maps render with MapLibre GL over OpenStreetMap raster tiles, and geocoding goes through Nominatim, called only from our server routes (`/api/geocode`, `/api/geocode/reverse`). We rejected Google Maps and Mapbox because both bill by usage after a free tier and need API keys. Routing every Nominatim call through our server lets us honor its usage policy (an identifying User-Agent, 1 request per second) and cache results in one place; browsers never call Nominatim directly.

## Consequences

- The throttle only covers a single server instance; heavy traffic means moving to Photon, a self-hosted geocoder, or a paid one.
- Any future routing service (for example, street paths) follows the same rule: a server-side proxy, never a browser call to a public demo server.
