export type GeocodeResult = {
  /** Primary display name — landmark / POI. */
  displayName: string;
  /** Full address minus postcode/country — shown as grey sub-line in search dropdown. */
  detailName?: string;
  /** Simplified address — barangay, city, province — stored as pin sublabel. */
  secondaryName?: string;
  /** Raw Nominatim display_name (escape hatch / tooltip). */
  fullName?: string;
  lat: number;
  lon: number;
  type: string;
  category?: string;
  importance?: number;
};
