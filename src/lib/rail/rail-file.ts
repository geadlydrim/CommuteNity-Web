import { z } from "zod";

/**
 * Shape of `rail-lines.json`, written by `scripts/rail/build-rail.sh`. Per
 * line: every station with its stop positions, and per direction the track as
 * one encoded polyline (precision 5) plus each station's position in metres
 * along that polyline, in station order. Station order is the first
 * direction's travel order, so the second direction's positions descend.
 */
const stopSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

const stationSchema = z.object({
  name: z.string().min(1),
  /** `[lat, lng]` of each OSM stop position of the station (one per direction, usually). */
  stops: z.array(stopSchema).min(1),
});

const directionSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  /** Metres along `path` of each station, indexed like the line's `stations`. */
  at: z.array(z.number().nonnegative()),
});

export const railModeSchema = z.enum(["mrt", "lrt"]);
export type RailMode = z.infer<typeof railModeSchema>;

/** Whether legs of `mode` follow a rail line rather than a street path. */
export function isRailMode(mode: string): mode is RailMode {
  return railModeSchema.safeParse(mode).success;
}

const lineSchema = z
  .object({
    id: z.string().min(1),
    mode: railModeSchema,
    name: z.string().min(1),
    stations: z.array(stationSchema).min(2),
    directions: z.array(directionSchema).min(1),
  })
  .refine((line) => line.directions.every((d) => d.at.length === line.stations.length), {
    message: "every direction needs one position per station",
  });

export const railFileSchema = z.object({
  license: z.string(),
  extract: z.string(),
  lines: z.array(lineSchema).min(1),
});

export type RailFile = z.infer<typeof railFileSchema>;
