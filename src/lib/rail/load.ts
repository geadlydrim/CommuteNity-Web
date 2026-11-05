import { railFileSchema } from "./rail-file";
import { prepareRail, type RailData } from "./slice";

let loading: Promise<RailData> | null = null;

/**
 * Loads the rail file. The JSON is a dynamic import, so it becomes its own
 * chunk fetched from this app the first time the guide builder needs it; the
 * feed never loads it and nothing asks Overpass. A failed load can be retried.
 */
export function loadRail(): Promise<RailData> {
  loading ??= import("./rail-lines.json")
    .then((module) => prepareRail(railFileSchema.parse(module.default)))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
