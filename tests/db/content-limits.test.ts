import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

const CHECK_VIOLATION = "23514";

const twoPinPostMap = {
  version: 1,
  pins: [
    { lat: 14.5995, lng: 120.9842, label: "Quiapo" },
    { lat: 14.5547, lng: 121.0244, label: "Ayala" },
  ],
};

const smallGuide = {
  version: 1,
  pins: [{ lat: 14.5995, lng: 120.9842, label: "Board here" }],
  transfers: [],
};

// Random hex so the padding stays large even if Postgres compresses the value.
const oversizedMap = {
  ...twoPinPostMap,
  padding: randomBytes(10000).toString("hex"),
};

const insertPost = "insert into public.posts (body, map_data) values ($1, $2) returning id";
const insertComment =
  "insert into public.comments (post_id, author_id, body, map_data) values ($1, $2, $3, $4) returning id";

async function riderWithPost(db: Db, username: string): Promise<{ rider: string; postId: string }> {
  const rider = await db.createRider(username);
  await db.actAs(rider);
  const res = await db.run(insertPost, ["Jeep from Quiapo to Ayala", null]);
  if (!res.ok) throw new Error(`could not create post: ${res.message}`);
  const postId = res.rows[0]?.id;
  if (typeof postId !== "string") throw new Error("post insert returned no id");
  return { rider, postId };
}

describe.skipIf(!hasDb)("content limits", () => {
  afterAll(closeDb);

  it("rejects a post whose body is only whitespace", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("blank_poster");
      await db.actAs(rider);

      const res = await db.run(insertPost, ["  \n \n  ", null]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it("rejects a comment whose body is only whitespace", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "blank_commenter");

      const res = await db.run(insertComment, [postId, rider, " \n\n ", null]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  const unicodeBlanks = [
    { name: "vertical tab", body: "\u000b" },
    { name: "form feed", body: "\u000c" },
    { name: "non-breaking and ideographic spaces", body: "\u00a0\u3000" },
  ];

  it.each(unicodeBlanks)("rejects a post whose body is only $name", ({ body }) =>
    withRollback(async (db) => {
      const rider = await db.createRider("unicode_blank_poster");
      await db.actAs(rider);

      const res = await db.run(insertPost, [body, null]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it.each(unicodeBlanks)("rejects a comment whose body is only $name", ({ body }) =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "uni_blank_commenter");

      const res = await db.run(insertComment, [postId, rider, body, null]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it("accepts a post and a comment with a non-breaking space between words", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "nbsp_rider");

      const post = await db.run(insertPost, ["Quiapo\u00a0to Ayala", null]);
      expect(post).toMatchObject({ ok: true, rowCount: 1 });

      const comment = await db.run(insertComment, [postId, rider, "Take the\u00a0jeep", null]);
      expect(comment).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("rejects a post with an oversized post map", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("big_map_poster");
      await db.actAs(rider);

      const res = await db.run(insertPost, ["Big map", JSON.stringify(oversizedMap)]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it("rejects a comment with an oversized guide", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "big_guide_rider");

      const res = await db.run(insertComment, [postId, rider, "Big guide", JSON.stringify(oversizedMap)]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it("accepts a normal post with a two-pin post map", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("normal_poster");
      await db.actAs(rider);

      const res = await db.run(insertPost, ["How do I get from Quiapo to Ayala?", JSON.stringify(twoPinPostMap)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("accepts a comment with a small guide", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "normal_guide");

      const res = await db.run(insertComment, [postId, rider, "Take the jeep at the church", JSON.stringify(smallGuide)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));
});
