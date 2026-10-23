import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

const CUBAO = "SRID=4326;POINT(121.0527 14.6197)";

function insertStop(db: Db, fields: { id?: string; createdBy: string; status?: string; netVotes?: number }) {
  return db.run(
    `insert into public.stops (id, name, location, mode, created_by, status, net_votes)
     values ($1, 'Cubao', $2::geography, 'jeepney', $3, $4, $5)`,
    [fields.id ?? randomUUID(), CUBAO, fields.createdBy, fields.status ?? "pending", fields.netVotes ?? 0],
  );
}

function insertRoute(db: Db, fields: { id?: string; createdBy: string; status?: string; netVotes?: number }) {
  return db.run(
    `insert into public.routes (id, name, mode, created_by, status, net_votes)
     values ($1, 'Cubao–Divisoria via España', 'jeepney', $2, $3, $4)`,
    [fields.id ?? randomUUID(), fields.createdBy, fields.status ?? "pending", fields.netVotes ?? 0],
  );
}

describe.skipIf(!hasDb)("catalog submissions", () => {
  afterAll(closeDb);

  describe.each([
    ["stop", insertStop],
    ["route", insertRoute],
  ] as const)("%s", (_kind, insert) => {
    it("rider can submit one as pending, in their own name", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("honest_submitter");
        await db.actAs(rider);
        expect(await insert(db, { createdBy: rider })).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot submit one already approved", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("eager_submitter");
        await db.actAs(rider);
        expect((await insert(db, { createdBy: rider, status: "approved" })).ok).toBe(false);
      }));

    it("rider cannot submit one in someone else's name", () =>
      withRollback(async (db) => {
        const other = await db.createRider("framed_rider");
        const rider = await db.createRider("framing_rider");
        await db.actAs(rider);
        expect((await insert(db, { createdBy: other })).ok).toBe(false);
      }));

    it("rider cannot submit one with votes already counted", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("vote_stuffer");
        await db.actAs(rider);
        expect((await insert(db, { createdBy: rider, netVotes: 5 })).ok).toBe(false);
      }));
  });

  describe("edit proposal", () => {
    const propose = (
      db: Db,
      fields: { proposedBy: string; status?: string; reviewedBy?: string; netVotes?: number; resolvedAt?: string },
    ) =>
      db.run(
        `insert into public.edit_proposals
           (target_type, target_id, proposed_by, change_payload, status, reviewed_by, net_votes, resolved_at)
         values ('route', $1, $2, '{"fare": 13}', $3, $4, $5, $6)`,
        [
          randomUUID(),
          fields.proposedBy,
          fields.status ?? "pending",
          fields.reviewedBy ?? null,
          fields.netVotes ?? 0,
          fields.resolvedAt ?? null,
        ],
      );

    it("rider can propose an edit as pending, in their own name", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("honest_editor");
        await db.actAs(rider);
        expect(await propose(db, { proposedBy: rider })).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot propose an edit already approved", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("eager_editor");
        await db.actAs(rider);
        expect((await propose(db, { proposedBy: rider, status: "approved" })).ok).toBe(false);
      }));

    it("rider cannot propose an edit in someone else's name", () =>
      withRollback(async (db) => {
        const other = await db.createRider("framed_editor");
        const rider = await db.createRider("framing_editor");
        await db.actAs(rider);
        expect((await propose(db, { proposedBy: other })).ok).toBe(false);
      }));

    it("rider cannot propose an edit marked as already reviewed", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("self_reviewer");
        await db.actAs(rider);
        expect((await propose(db, { proposedBy: rider, reviewedBy: rider })).ok).toBe(false);
      }));

    it("rider cannot propose an edit with votes already counted", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("proposal_stuffer");
        await db.actAs(rider);
        expect((await propose(db, { proposedBy: rider, netVotes: 5 })).ok).toBe(false);
      }));

    it("rider cannot propose an edit marked as already resolved", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("self_resolver");
        await db.actAs(rider);
        expect((await propose(db, { proposedBy: rider, resolvedAt: "2026-10-01T00:00:00Z" })).ok).toBe(false);
      }));
  });

  describe("route segment", () => {
    async function routeWithStops(db: Db, owner: string) {
      const [routeId, fromId, toId] = [randomUUID(), randomUUID(), randomUUID()];
      await db.actAs(owner);
      await insertRoute(db, { id: routeId, createdBy: owner });
      await insertStop(db, { id: fromId, createdBy: owner });
      await insertStop(db, { id: toId, createdBy: owner });
      return { routeId, fromId, toId };
    }
    const addSegment = (db: Db, s: { routeId: string; fromId: string; toId: string }) =>
      db.run(
        `insert into public.route_segments (route_id, sequence, from_stop_id, to_stop_id, fare)
         values ($1, 1, $2, $3, 13)`,
        [s.routeId, s.fromId, s.toId],
      );

    it("rider can add a segment to their own pending route", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("route_builder");
        const route = await routeWithStops(db, rider);
        expect(await addSegment(db, route)).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot add a segment to someone else's route", () =>
      withRollback(async (db) => {
        const owner = await db.createRider("route_owner");
        const rider = await db.createRider("route_meddler");
        const route = await routeWithStops(db, owner);
        await db.actAs(rider);
        expect((await addSegment(db, route)).ok).toBe(false);
      }));

    it("rider cannot add a segment to their route once it is approved", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("approved_owner");
        const route = await routeWithStops(db, rider);
        await db.actAsAdmin();
        await db.run("update public.routes set status = 'approved' where id = $1", [route.routeId]);
        await db.actAs(rider);
        expect((await addSegment(db, route)).ok).toBe(false);
      }));
  });

  describe("report", () => {
    const report = (db: Db, fields: { reportedBy: string; status?: string }) =>
      db.run(
        `insert into public.reports (reported_by, target_type, target_id, reason, status)
         values ($1, 'route', $2, 'wrong_fare', $3)`,
        [fields.reportedBy, randomUUID(), fields.status ?? "open"],
      );

    it("rider can file an open report in their own name", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("honest_reporter");
        await db.actAs(rider);
        expect(await report(db, { reportedBy: rider })).toMatchObject({ ok: true, rowCount: 1 });
      }));

    it("rider cannot file a report in someone else's name", () =>
      withRollback(async (db) => {
        const other = await db.createRider("framed_reporter");
        const rider = await db.createRider("framing_reporter");
        await db.actAs(rider);
        expect((await report(db, { reportedBy: other })).ok).toBe(false);
      }));

    it("rider cannot file a report already resolved", () =>
      withRollback(async (db) => {
        const rider = await db.createRider("closing_reporter");
        await db.actAs(rider);
        expect((await report(db, { reportedBy: rider, status: "resolved" })).ok).toBe(false);
      }));
  });
});
