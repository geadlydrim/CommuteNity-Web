/**
 * Static previews of stored map documents: a post map (posts.map_data) and a
 * guide (comments.map_data). Each reads the raw column through its versioned
 * schema (ADR 0004): a known version renders as static tiles (ADR 0005), a
 * newer version than this build knows shows a placeholder, and a missing or
 * malformed document renders nothing.
 *
 * No hooks and no "use client", so the server post card renders these.
 */
import { parsePostMap } from "@/lib/schemas/post-map";
import { parseGuide } from "@/lib/schemas/guide-map";
import { StaticPostMap } from "./static-post-map";
import { StaticGuideMap } from "./static-guide-map";

function UnavailableMap() {
  return (
    <p className="rounded-lg border bg-muted px-3 py-2 text-xs text-muted-foreground">
      This map can&apos;t be shown yet.
    </p>
  );
}

export function PostMapPreview({ mapData }: { mapData: unknown }) {
  const parsed = parsePostMap(mapData);
  switch (parsed.status) {
    case "ok":
      return <StaticPostMap pins={parsed.map.pins} width={560} height={240} />;
    case "unknown-version":
      return <UnavailableMap />;
    default:
      return null;
  }
}

export function GuidePreview({ mapData }: { mapData: unknown }) {
  const parsed = parseGuide(mapData);
  switch (parsed.status) {
    case "ok":
      return <StaticGuideMap data={parsed.map} width={480} height={200} />;
    case "unknown-version":
      return <UnavailableMap />;
    default:
      return null;
  }
}
