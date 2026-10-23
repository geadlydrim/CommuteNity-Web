import { describe, expect, it } from "vitest";
import { extensionForType, ownAvatarPath } from "@/lib/avatars";

const rider = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const base = "https://abc.supabase.co/storage/v1/object/public/avatars/";

describe("extensionForType", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("%s → %s", (mime, ext) => {
    expect(extensionForType(mime)).toBe(ext);
  });

  it("returns null for unsupported types", () => {
    expect(extensionForType("image/svg+xml")).toBeNull();
  });
});

describe("ownAvatarPath", () => {
  it("returns the rider's own path", () => {
    expect(ownAvatarPath(`${base}${rider}/avatar-1.png`, rider)).toBe(`${rider}/avatar-1.png`);
  });

  it("returns a nested own path", () => {
    expect(ownAvatarPath(`${base}${rider}/old/avatar-1.png`, rider)).toBe(
      `${rider}/old/avatar-1.png`
    );
  });

  it("rejects another rider's path", () => {
    expect(ownAvatarPath(`${base}${other}/avatar-1.png`, rider)).toBeNull();
  });

  it("rejects a foreign host without the avatars prefix", () => {
    expect(ownAvatarPath(`https://example.com/${rider}/avatar-1.png`, rider)).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(ownAvatarPath("not a url", rider)).toBeNull();
    expect(ownAvatarPath(`${base}${rider}/%E0%A4%A.png`, rider)).toBeNull();
  });

  it("decodes a percent-encoded path", () => {
    expect(ownAvatarPath(`${base}${rider}/my%20photo.png`, rider)).toBe(`${rider}/my photo.png`);
  });

  it("returns null for no URL", () => {
    expect(ownAvatarPath(null, rider)).toBeNull();
  });
});
