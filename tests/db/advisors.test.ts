import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback } from "./rider";

describe.skipIf(!hasDb)("advisor cleanup", () => {
  afterAll(closeDb);

  describe("catalog vote", () => {
    it("rider can vote on an approved route and the route is left untouched", () =>
      withRollback(async (db) => {
        const rider = await db.createRider(`voter_${Date.now()}`);
        const routeId = randomUUID();
        await db.rows(
          `insert into public.routes (id, name, mode, created_by, status, net_votes)
           values ($1, 'Cubao–Divisoria via España', 'jeepney', $2, 'approved', 0)`,
          [routeId, rider],
        );

        await db.actAs(rider);
        const vote = await db.run(
          `insert into public.votes (user_id, target_type, target_id, value)
           values ($1, 'route', $2, 1)`,
          [rider, routeId],
        );
        expect(vote.ok).toBe(true);

        await db.actAsAdmin();
        const [route] = await db.rows<{ net_votes: number; status: string }>(
          "select net_votes, status from public.routes where id = $1",
          [routeId],
        );
        expect(route).toEqual({ net_votes: 0, status: "approved" });
      }));
  });
});
