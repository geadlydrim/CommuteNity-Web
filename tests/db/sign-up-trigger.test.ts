import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

type Profile = { username: string | null; display_name: string | null };

/** Sign up the way GoTrue does: insert the auth user; the trigger creates the profile. */
async function signUp(db: Db, meta: Record<string, string>): Promise<string> {
  await db.actAsAdmin();
  const [row] = await db.rows<{ id: string }>(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, $2::jsonb)
     returning id`,
    [`${randomUUID()}@test.commutenity.invalid`, JSON.stringify(meta)],
  );
  if (!row) throw new Error("sign-up returned no row");
  return row.id;
}

async function profile(db: Db, id: string): Promise<Profile | undefined> {
  const [row] = await db.rows<Profile>(
    "select username, display_name from public.users where id = $1",
    [id],
  );
  return row;
}

async function accountExists(db: Db, id: string): Promise<boolean> {
  const rows = await db.rows("select 1 from auth.users where id = $1", [id]);
  return rows.length === 1;
}

describe.skipIf(!hasDb)("profile-creation trigger", () => {
  afterAll(closeDb);

  it("stores an uppercase username lowercased", () =>
    withRollback(async (db) => {
      const id = await signUp(db, { username: "  Trg_Upper ", display_name: "Upper" });

      expect(await profile(db, id)).toEqual({ username: "trg_upper", display_name: "Upper" });
    }));

  it.each(["a", "has space"])("creates the account with a NULL username for %j", (username) =>
    withRollback(async (db) => {
      const id = await signUp(db, { username, display_name: "Invalid" });

      expect(await accountExists(db, id)).toBe(true);
      expect(await profile(db, id)).toEqual({ username: null, display_name: "Invalid" });
    }));

  it("creates the account with a NULL username when the username is taken", () =>
    withRollback(async (db) => {
      const first = await db.createRider("trg_taken");
      const second = await signUp(db, { username: "TRG_TAKEN", display_name: "Second" });

      expect(await accountExists(db, second)).toBe(true);
      expect(await profile(db, second)).toEqual({ username: null, display_name: "Second" });
      expect((await profile(db, first))?.username).toBe("trg_taken");
    }));

  it("defaults the display name from full_name when display_name is absent", () =>
    withRollback(async (db) => {
      const id = await signUp(db, { full_name: "Juan dela Cruz", name: "Juan" });

      expect(await profile(db, id)).toEqual({ username: null, display_name: "Juan dela Cruz" });
    }));

  it("truncates a display name longer than 40 characters to 40", () =>
    withRollback(async (db) => {
      const id = await signUp(db, { username: "trg_long", display_name: "x".repeat(60) });

      expect((await profile(db, id))?.display_name).toBe("x".repeat(40));
    }));
});
