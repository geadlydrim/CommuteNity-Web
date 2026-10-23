import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback } from "./rider";

const CHECK_VIOLATION = "23514";
const setDisplayName = "update public.users set display_name = $1 where id = $2";

describe.skipIf(!hasDb)("profile limits", () => {
  afterAll(closeDb);

  it("rejects a 41-character display name", async () => {
    await withRollback(async (db) => {
      const rider = await db.createRider("limits_long");
      await db.actAs(rider);
      const res = await db.run(setDisplayName, ["a".repeat(41), rider]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe(CHECK_VIOLATION);
    });
  });

  it("accepts a 40-character display name", async () => {
    await withRollback(async (db) => {
      const rider = await db.createRider("limits_ok");
      await db.actAs(rider);
      const res = await db.run(setDisplayName, ["a".repeat(40), rider]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    });
  });
});
