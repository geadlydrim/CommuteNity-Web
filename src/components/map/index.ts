// Public map exports for code outside src/components/map/.
//
// Server-safe on purpose: nothing here pulls in MapLibre, its CSS, or the
// builders, so the feed can render previews without shipping map-library code
// (ADR 0005). Interactive pieces (the focus map, the post-map and guide
// builders) are imported by path with next/dynamic where they're used.
// react-map-gl itself is only imported inside this folder, via ./primitives.

// Static previews of stored post maps and guides (placeholder for newer versions).
export { PostMapPreview, GuidePreview } from "./map-previews";
