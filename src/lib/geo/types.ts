export type GeocodeResult = {
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  category?: string;
  importance?: number;
};
