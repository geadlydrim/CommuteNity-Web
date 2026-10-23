import { describe, expect, it } from "vitest";
import { buildLabelParts } from "@/lib/geo/label";

describe("buildLabelParts", () => {
  it("labels a point of interest by its name, with the address underneath", () => {
    const parts = buildLabelParts({
      name: "Araneta City Bus Port",
      display_name:
        "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
      address: {
        amenity: "Araneta City Bus Port",
        road: "General Romulo Avenue",
        quarter: "Socorro",
        suburb: "Cubao",
        city: "Quezon City",
        state: "Metro Manila",
        postcode: "1109",
        country: "Philippines",
        country_code: "ph",
      },
    });

    expect(parts).toEqual({
      primary: "Araneta City Bus Port",
      detail: "General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila",
      secondary: "Socorro, Quezon City, Metro Manila",
      full: "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
    });
  });

  it("labels an unnamed point on a road by the road", () => {
    const parts = buildLabelParts({
      name: "",
      display_name: "Taft Avenue, Barangay 720, Malate, Manila, Metro Manila, 1004, Philippines",
      address: {
        road: "Taft Avenue",
        quarter: "Barangay 720",
        city_district: "Malate",
        city: "Manila",
        state: "Metro Manila",
        postcode: "1004",
        country: "Philippines",
        country_code: "ph",
      },
    });

    expect(parts).toEqual({
      primary: "Taft Avenue",
      detail: "Barangay 720, Malate, Manila, Metro Manila",
      secondary: "Barangay 720, Manila, Metro Manila",
      full: "Taft Avenue, Barangay 720, Malate, Manila, Metro Manila, 1004, Philippines",
    });
  });

  it("labels a point with only a barangay by the barangay", () => {
    const parts = buildLabelParts({
      name: "",
      display_name: "Fort Bonifacio, Taguig, Metro Manila, 1634, Philippines",
      address: {
        quarter: "Fort Bonifacio",
        city: "Taguig",
        state: "Metro Manila",
        postcode: "1634",
        country: "Philippines",
        country_code: "ph",
      },
    });

    expect(parts).toEqual({
      primary: "Fort Bonifacio",
      detail: "Taguig, Metro Manila",
      secondary: "Taguig, Metro Manila",
      full: "Fort Bonifacio, Taguig, Metro Manila, 1634, Philippines",
    });
  });

  it("does not repeat the primary name in the lines underneath", () => {
    const parts = buildLabelParts({
      name: "Epifanio de los Santos Avenue",
      display_name:
        "Epifanio de los Santos Avenue, Wack-Wack Greenhills, Mandaluyong, Metro Manila, 1550, Philippines",
      address: {
        road: "Epifanio de los Santos Avenue",
        quarter: "Wack-Wack Greenhills",
        city: "Mandaluyong",
        state: "Metro Manila",
        postcode: "1550",
        country: "Philippines",
        country_code: "ph",
      },
    });

    expect(parts).toEqual({
      primary: "Epifanio de los Santos Avenue",
      detail: "Wack-Wack Greenhills, Mandaluyong, Metro Manila",
      secondary: "Wack-Wack Greenhills, Mandaluyong, Metro Manila",
      full: "Epifanio de los Santos Avenue, Wack-Wack Greenhills, Mandaluyong, Metro Manila, 1550, Philippines",
    });
  });

  it("de-duplicates case-insensitively", () => {
    const parts = buildLabelParts({
      name: "Quiapo",
      display_name: "Quiapo, Manila, Metro Manila, Philippines",
      address: {
        suburb: "QUIAPO",
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
    });

    expect(parts.detail).toBe("Manila, Metro Manila");
    expect(parts.secondary).toBe("Manila, Metro Manila");
  });

  it("falls back to the full display name when the address names nothing", () => {
    const parts = buildLabelParts({
      name: "",
      display_name: "Philippines",
      address: { country: "Philippines", country_code: "ph" },
    });

    expect(parts).toEqual({ primary: "Philippines", detail: "", secondary: "", full: "Philippines" });
  });
});
