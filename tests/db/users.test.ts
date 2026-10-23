import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback } from "./rider";

describe.skipIf(!hasDb)("rider profile writes", () => {
  afterAll(closeDb);

  it("rider cannot set their own reputation", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("rep_rider");
      await db.actAs(rider);

      await db.run("update public.users set reputation = 9999 where id = $1", [rider]);

      const [row] = await db.rows<{ reputation: number }>(
        "select reputation from public.users where id = $1",
        [rider],
      );
      expect(row?.reputation).toBe(0);
    }));

  it("rider can still change their display name and username", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("edit_rider");
      await db.actAs(rider);

      const res = await db.run(
        "update public.users set display_name = 'Juan', username = 'edit_rider_2' where id = $1",
        [rider],
      );

      expect(res).toMatchObject({ ok: true, rowCount: 1 });
      const [row] = await db.rows("select username, display_name from public.users where id = $1", [rider]);
      expect(row).toEqual({ username: "edit_rider_2", display_name: "Juan" });
    }));

  it("rider cannot dodge the username cooldown by clearing its date", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("cool_rider");
      await db.actAs(rider);
      await db.run("update public.users set username = 'cool_rider_2' where id = $1", [rider]);

      const clear = await db.run("update public.users set username_changed_at = null where id = $1", [rider]);
      const second = await db.run("update public.users set username = 'cool_rider_3' where id = $1", [rider]);

      expect(clear.ok).toBe(false);
      expect(second.ok).toBe(false);
      const [row] = await db.rows("select username from public.users where id = $1", [rider]);
      expect(row).toEqual({ username: "cool_rider_2" });
    }));

  describe("avatar", () => {
    const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars`;
    const setAvatar = "update public.users set avatar_url = $2 where id = $1";

    it("rider can point their avatar at a photo in their own folder", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("own_avatar");
        await db.actAs(rider);

        const url = `${storageBase}/${rider}/avatar-1729600000000.png`;
        expect(await db.run(setAvatar, [rider, url])).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider can go back to their default placeholder", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("default_avatar");
        await db.actAs(rider);

        const url = `https://api.dicebear.com/9.x/identicon/svg?seed=${rider}`;
        expect(await db.run(setAvatar, [rider, url])).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot point their avatar at an outside URL", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("ext_avatar");
        await db.actAs(rider);

        const res = await db.run(setAvatar, [rider, "https://tracker.example.com/pixel.png"]);
        expect(res.ok).toBe(false);
        expect(res.ok ? "" : res.message).toContain("avatar_url_invalid");
      }));

    it("rider cannot use another rider's photo", () =>
      withRollback(async (db) => {
        const other = await db.createRider("photo_owner");
        const rider = await db.createRider("photo_thief");
        await db.actAs(rider);

        const res = await db.run(setAvatar, [rider, `${storageBase}/${other}/avatar-1.png`]);
        expect(res.ok).toBe(false);
      }));

    it("rider can use a photo in a subfolder of their own folder", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("nested_avatar");
        await db.actAs(rider);

        const url = `${storageBase}/${rider}/profile/avatar-2.webp?v=2`;
        expect(await db.run(setAvatar, [rider, url])).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot use a lookalike photo hosted by another Supabase project", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("lookalike_avatar");
        await db.actAs(rider);

        const url = `https://attacker-project.supabase.co/storage/v1/object/public/avatars/${rider}/avatar-1.png`;
        expect((await db.run(setAvatar, [rider, url])).ok).toBe(false);
      }));

    it.each([
      ["a parent folder", (id: string) => `${id}/../someone-else/avatar.png`],
      ["an encoded parent folder", (id: string) => `${id}/%2E%2E/someone-else/avatar.png`],
    ])("rider cannot escape their folder via %s", (_case, path) =>
      withRollback(async (db) => {
        const rider = await db.createRider("escape_avatar");
        await db.actAs(rider);

        expect((await db.run(setAvatar, [rider, `${storageBase}/${path(rider)}`])).ok).toBe(false);
      }));

    it("rider with a legacy avatar can still edit other profile fields", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("legacy_avatar");
        await db.run("update public.users set avatar_url = 'https://legacy.example.com/a.png' where id = $1", [rider]);
        await db.actAs(rider);

        const res = await db.run("update public.users set display_name = 'Legacy' where id = $1", [rider]);
        expect(res).toMatchObject({ ok: true, rowCount: 1 });
      }));
  });
});
