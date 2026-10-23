import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback } from "./rider";

describe.skipIf(!hasDb)("post votes", () => {
  afterAll(closeDb);

  it("a post's vote total follows riders' votes", () =>
    withRollback(async (db) => {
      const author = await db.createRider("post_author");
      const fan = await db.createRider("post_fan");
      const critic = await db.createRider("post_critic");
      const postId = randomUUID();
      await db.actAs(author);
      await db.rows("insert into public.posts (id, body) values ($1, 'Sakay ka sa Cubao terminal')", [postId]);
      const total = async () =>
        (await db.rows<{ net_votes: number }>("select net_votes from public.posts where id = $1", [postId]))[0]
          .net_votes;

      await db.actAs(fan);
      await db.rows("insert into public.post_votes (post_id, user_id, value) values ($1, $2, 1)", [postId, fan]);
      await db.actAs(critic);
      await db.rows("insert into public.post_votes (post_id, user_id, value) values ($1, $2, -1)", [postId, critic]);
      await db.rows("update public.post_votes set value = 1 where post_id = $1 and user_id = $2", [postId, critic]);
      expect(await total()).toBe(2);

      await db.actAs(fan);
      await db.rows("delete from public.post_votes where post_id = $1 and user_id = $2", [postId, fan]);
      expect(await total()).toBe(1);
    }));
});
