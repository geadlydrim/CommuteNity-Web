import type { z } from "zod";
import type {
  geocodeResultSchema,
  reverseGeocodeResultSchema,
} from "@/lib/schemas/geocode";

/** One place search result, exactly as `/api/geocode` returns it. */
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

/** A reverse-geocoded point, exactly as `/api/geocode/reverse` returns it. */
export type ReverseGeocodeResult = z.infer<typeof reverseGeocodeResultSchema>;
