import { describe, expect, it } from "vitest";
import { hasDb, withCommittedFixtures, type CommittedFixtures, type Session } from "./rider";

const castVote = "insert into public.post_votes (post_id, user_id, value) values ($1, $2, $3)";

/** Commit a post written by this rider and return its id. */
async function postAs(session: Session, riderId: string): Promise<string> {
  await session.rows("begin");
  await session.actAs(riderId);
  const [post] = await session.rows<{ id: string }>(
    "insert into public.posts (body) values ('Sakay ka sa Cubao terminal') returning id",
  );
  await session.rows("commit");
  return post.id;
}

async function voteTotal(fx: CommittedFixtures, postId: string): Promise<number> {
  const [post] = await fx.rows<{ net_votes: number }>("select net_votes from public.posts where id = $1", [postId]);
  return post.net_votes;
}

describe.skipIf(!hasDb)("post votes cast at the same moment", () => {
  it("two riders upvoting together both count", () =>
    withCommittedFixtures(async (fx) => {
      const riderA = await fx.createRider("vote_a");
      const riderB = await fx.createRider("vote_b");
      const a = await fx.session();
      const b = await fx.session();
      const postId = await postAs(a, riderA);

      await a.rows("begin");
      await a.actAs(riderA);
      await a.rows(castVote, [postId, riderA, 1]);

      await b.rows("begin");
      await b.actAs(riderB);
      const bVote = b.rows(castVote, [postId, riderB, 1]);
      bVote.catch(() => {}); // awaited below; don't let an early failure go unhandled
      await fx.waitUntilBlocked(b);

      await a.rows("commit");
      await bVote;
      await b.rows("commit");

      expect(await voteTotal(fx, postId)).toBe(2);
    }));

  it("a rider switching to a downvote while another upvotes ends at the true total", () =>
    withCommittedFixtures(async (fx) => {
      const riderA = await fx.createRider("vote_a");
      const riderB = await fx.createRider("vote_b");
      const a = await fx.session();
      const b = await fx.session();
      const postId = await postAs(a, riderA);
      await a.rows("begin");
      await a.actAs(riderA);
      await a.rows(castVote, [postId, riderA, 1]);
      await a.rows("commit");
      expect(await voteTotal(fx, postId)).toBe(1);

      await a.rows("begin");
      await a.actAs(riderA);
      await a.rows("update public.post_votes set value = -1 where post_id = $1 and user_id = $2", [postId, riderA]);

      await b.rows("begin");
      await b.actAs(riderB);
      const bVote = b.rows(castVote, [postId, riderB, 1]);
      bVote.catch(() => {}); // awaited below; don't let an early failure go unhandled
      await fx.waitUntilBlocked(b);

      await a.rows("commit");
      await bVote;
      await b.rows("commit");

      // Rider A's -1 plus rider B's +1.
      expect(await voteTotal(fx, postId)).toBe(0);
    }));
});
