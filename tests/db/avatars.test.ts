import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

async function uploadedAvatar(db: Db, owner: string): Promise<string> {
  const name = `${owner}/avatar-1729600000000.png`;
  await db.actAsAdmin();
  await db.rows("insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)", [name, owner]);
  return name;
}

// The Storage API sets this flag for its own deletes; direct SQL deletes are blocked otherwise.
async function deleteAvatar(db: Db, name: string) {
  await db.run("select set_config('storage.allow_delete_query', 'true', true)");
  return db.run("delete from storage.objects where bucket_id = 'avatars' and name = $1", [name]);
}

describe.skipIf(!hasDb)("avatar photos", () => {
  afterAll(closeDb);

  it("rider can remove a photo from their own folder", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("photo_cleaner");
      const name = await uploadedAvatar(db, rider);
      await db.actAs(rider);

      expect(await deleteAvatar(db, name)).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("rider cannot remove another rider's photo", () =>
    withRollback(async (db) => {
      const owner = await db.createRider("photo_keeper");
      const rider = await db.createRider("photo_vandal");
      const name = await uploadedAvatar(db, owner);
      await db.actAs(rider);

      expect(await deleteAvatar(db, name)).toMatchObject({ ok: true, rowCount: 0 });
    }));
});
