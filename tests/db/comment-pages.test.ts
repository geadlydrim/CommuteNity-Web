import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

/**
 * The database contract `listComments` (src/lib/posts/comments.ts) relies on:
 * a signed-out reader can read comments with their authors, and the keyset
 * cursor on (created_at, id) pages a thread without skipping or repeating a
 * comment, even when the page boundary falls between two comments with the
 * same timestamp.
 */

type Row = { id: string; created_at: Date; username: string | null };

// The same selection and order as `listComments`, one row past the page.
const PAGE = `
  select c.id, c.created_at, u.username
  from public.comments c
  left join public.users u on u.id = c.author_id
  where c.post_id = $1
    and ($2::timestamptz is null or c.created_at > $2 or (c.created_at = $2 and c.id > $3::uuid))
  order by c.created_at, c.id
  limit 51`;

async function actAsAnon(db: Db): Promise<void> {
  await db.actAsAdmin();
  await db.rows("set local role anon");
  await db.rows("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
}

describe.skipIf(!hasDb)("comment pages", () => {
  afterAll(closeDb);

  it("a signed-out reader pages a long thread oldest first without gaps or repeats", () =>
    withRollback(async (db) => {
      const author = await db.createRider("thread_author");
      const postId = randomUUID();
      await db.rows("insert into public.posts (id, user_id, body) values ($1, $2, 'Saan sakay papuntang Quiapo?')", [
        postId,
        author,
      ]);
      // 55 comments a second apart, except the 50th and 51st share a time, so
      // the first page ends inside a tie and only the id can split it.
      await db.rows(
        `insert into public.comments (post_id, author_id, body, created_at)
         select $1, $2, 'comment ' || n,
                timestamptz '2026-01-01 00:00:00+00' + (case when n = 51 then 50 else n end) * interval '1 second'
         from generate_series(1, 55) as n`,
        [postId, author],
      );

      await actAsAnon(db);
      const first = await db.rows<Row>(PAGE, [postId, null, null]);
      expect(first).toHaveLength(51);
      const page1 = first.slice(0, 50);
      const cursor = page1.at(-1);
      if (!cursor) throw new Error("first page is empty");
      expect(page1.every((r) => r.username === "thread_author")).toBe(true);

      const page2 = await db.rows<Row>(PAGE, [postId, cursor.created_at, cursor.id]);
      expect(page2).toHaveLength(5);
      // The boundary tie: the next page starts at the cursor's own time.
      expect(page2[0]?.created_at.getTime()).toBe(cursor.created_at.getTime());

      const ids = [...page1, ...page2].map((r) => r.id);
      expect(new Set(ids).size).toBe(55);
      const all = await db.rows<{ id: string }>(
        "select id from public.comments where post_id = $1 order by created_at, id",
        [postId],
      );
      expect(ids).toEqual(all.map((r) => r.id));
    }));
});
