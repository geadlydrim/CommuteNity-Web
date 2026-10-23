/**
 * Two-tier, Philippine-aware place labels built from a Nominatim place.
 * Pure: no fetch, no clock. Shared by the forward and reverse geocode routes.
 */

/** The parts of a Nominatim place (jsonv2, `addressdetails=1`) a label reads. */
export interface PlaceLabelInput {
  name?: string | null;
  display_name?: string | null;
  address?: Partial<Record<string, string>>;
}

export interface LabelParts {
  /** Landmark / POI name — primary bold line. */
  primary: string;
  /** Full address minus postcode/country — shown in search dropdown grey sub-line. */
  detail: string;
  /** Simplified barangay, city, province — stored as pin sublabel. */
  secondary: string;
  /** Raw Nominatim display_name — tooltip / fallback. */
  full: string;
}

// Address keys to walk in order for the detail line (postcode/country excluded).
const DETAIL_KEY_ORDER = [
  "road",
  "quarter", "neighbourhood", "suburb", "village", "hamlet",
  "city_district", "district",
  "city", "town", "municipality",
  "county", "province", "state",
] as const;

/**
 * Derive Google-Maps-style label parts from one Nominatim place
 * (a `/search` array item or the `/reverse` root object).
 *
 * Two secondary strings are produced:
 *   detail    — full address chain, no postcode/country (for search dropdown)
 *   secondary — simplified barangay, city, province (stored as pin sublabel)
 */
export function buildLabelParts(raw: PlaceLabelInput): LabelParts {
  const a = raw.address ?? {};
  const name = raw.name?.trim() ?? "";

  const rawPoi =
    name || a.amenity || a.shop || a.tourism || a.leisure ||
    a.historic || a.office || a.building;
  const rawRoad = a.road;
  const rawBarangay =
    a.quarter || a.neighbourhood || a.suburb ||
    a.city_district || a.village || a.hamlet;
  const rawCity = a.city || a.town || a.municipality;
  const rawProvince = a.province || a.state;

  // Primary: prefer landmark → road → barangay → city
  const primaryVal =
    rawPoi || rawRoad || rawBarangay || rawCity || "";

  // Detail: all address keys in order, skipping the value already used as primary
  const primaryLower = primaryVal.toLowerCase();
  const detailSeen = new Set<string>([primaryLower].filter(Boolean));
  const detailParts: string[] = [];
  for (const key of DETAIL_KEY_ORDER) {
    const v = a[key];
    if (v && !detailSeen.has(v.toLowerCase())) {
      detailSeen.add(v.toLowerCase());
      detailParts.push(v);
    }
  }

  // Secondary (simplified): barangay → city → province, de-duped against primary
  const secondarySeen = new Set<string>([primaryLower].filter(Boolean));
  const secondaryParts = [rawBarangay, rawCity, rawProvince].filter(
    (v): v is string => {
      if (!v || secondarySeen.has(v.toLowerCase())) return false;
      secondarySeen.add(v.toLowerCase());
      return true;
    },
  );

  const full = raw.display_name ?? "";
  const primary = primaryVal || full;
  return {
    primary,
    detail: detailParts.join(", "),
    secondary: secondaryParts.join(", "),
    full,
  };
}
