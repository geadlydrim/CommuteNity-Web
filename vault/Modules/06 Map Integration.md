# Module 6 — Map Integration

#module

**Purpose:** Spatial UX for stops, routes, and pin-dropping.

← [[Home]]

---

## Status

All requirements **not started**.

| Requirement | Done? |
|-------------|-------|
| MapLibre GL JS + react-map-gl wrapper | ❌ |
| OSM tile source (no API key) | ❌ |
| Map pin drop for stop submission | ❌ |
| Route line rendering on detail screen | ❌ |
| Stops layer (clustered markers) | ❌ |
| Geocoding proxy at `src/app/api/geocode/` | ❌ |
| "Stops near me" map UI | ❌ |

---

## Planned Files

```
src/app/api/geocode/route.ts            ← Nominatim proxy (1 req/s)
src/components/map/MapView.tsx          ← base MapLibre wrapper
src/components/map/StopsLayer.tsx       ← clustered stop markers
src/components/map/RouteLine.tsx        ← route polyline renderer
src/components/map/PinDrop.tsx          ← click-to-place stop pin
```

---

## Tech

- **MapLibre GL JS** via `react-map-gl` — no API key
- **OSM tiles** — free, no rate limit concerns
- **Nominatim** (text → coords) — proxied through Next.js API route to enforce 1 req/s

---

## Route Polyline

Assembled from [[route_segments]] in `sequence` order: `from_stop.location` → `to_stop.location` chain.

---

## Open Questions

- Stop location input: MapLibre click vs lat/lng text fields?

---

## Related

[[stops]] · [[routes]] · [[route_segments]] · [[04 Routes]] · [[05 Stops]] · [[src-app]]
