import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { MAP_DATA_BUDGET_BYTES, fitGuide } from "@/lib/map/fit-document";
import { encodePath, simplifyPath, type LatLng } from "@/lib/map/path";
import { parseGuide, type GuideMapData } from "@/lib/schemas/guide-map";
import { parsePostMap, type MapData, type MapPin } from "@/lib/schemas/post-map";
import { crosstownRuns, fillerPath, streetWalk } from "../support/street-paths";
import { closeDb, hasDb, withRollback, type Db } from "./rider";

const CHECK_VIOLATION = "23514";

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function pinAt(point: LatLng, label: string): MapPin {
  return { lat: round5(point.lat), lng: round5(point.lng), label };
}

/**
 * Eight legs of a ~10 km cross-town trip, each with 10 vias and a street path
 * (version 2). `null` leaves every path as the router drew it, sampled every
 * 10 m; a number simplifies it to that many metres, as the routing endpoint does.
 */
function crosstownGuide(simplifyMeters: number | null): GuideMapData {
  const legs: GuideMapData["legs"] = [];
  let origin = pinAt({ lat: 14.5995, lng: 120.9842 }, "Quiapo");
  for (let i = 0; i < 8; i++) {
    const dense = streetWalk(origin, crosstownRuns(i), { jitterMeters: 0.3 });
    const destination = pinAt(dense[dense.length - 1]!, `Stop ${i + 1}`);
    const vias = Array.from({ length: 10 }, (_, k) => {
      const via = dense[Math.floor(((k + 1) * dense.length) / 11)]!;
      return { lat: round5(via.lat), lng: round5(via.lng) };
    });
    legs.push({
      id: `leg-${i}`,
      mode: i % 2 === 0 ? "jeepney" : "bus",
      origin,
      destination,
      vias,
      expressways: i % 2 === 1,
      path: encodePath(simplifyMeters === null ? dense : simplifyPath(dense, simplifyMeters)),
    });
    origin = destination;
  }
  const connectors = legs.slice(1).map((leg, i) => ({
    id: `transfer-${i}`,
    mode: "walking" as const,
    from: { legId: legs[i]!.id, end: "destination" as const },
    to: { legId: leg.id, end: "origin" as const },
  }));
  return { version: 2, kind: "guide", legs, connectors };
}

const jsonLength = (doc: unknown) => JSON.stringify(doc).length;

/**
 * A pin with the longest label and sublabel the schema allows and 6-decimal
 * coordinates: the biggest pin a rider can save, and the one jsonb stores
 * largest relative to its JSON text.
 */
function maximalPin(n: number): MapPin {
  return {
    lat: (14_500_001 + ((n * 104_729) % 399_999)) / 1e6,
    lng: (120_900_001 + ((n * 130_981) % 399_999)) / 1e6,
    label: `Pin ${n} `.padEnd(120, "L"),
    sublabel: `Barangay ${n}, `.padEnd(160, "S"),
  };
}

/**
 * Path lengths (characters) that bring a document to exactly the client budget:
 * every path starts at the 2-character minimum, and the room left under the
 * budget is shared out evenly. `sizeWith` measures the document for a set of lengths.
 */
function pathLengthsToBudget(count: number, sizeWith: (lengths: number[]) => number): number[] {
  const minimum = Array.from({ length: count }, () => 2);
  const room = MAP_DATA_BUDGET_BYTES - sizeWith(minimum);
  if (room < 0) throw new Error(`The maximal document is ${-room} bytes over the budget before any path`);
  return minimum.map((length, i) => length + Math.floor(room / count) + (i < room % count ? 1 : 0));
}

/** 8 legs, 10 vias each, 7 transfers, every pin at its longest labels: the biggest guide a rider can save. */
function maximalGuide(pathLengths: number[]): GuideMapData {
  const legs: GuideMapData["legs"] = pathLengths.map((length, i) => ({
    id: `leg-${i}`,
    mode: i % 2 === 0 ? "jeepney" : "bus",
    origin: maximalPin(2 * i),
    destination: maximalPin(2 * i + 1),
    vias: Array.from({ length: 10 }, (_, k) => {
      const { lat, lng } = maximalPin(100 + 10 * i + k);
      return { lat, lng };
    }),
    expressways: i % 2 === 1,
    path: fillerPath(length, i),
  }));
  const connectors = legs.slice(1).map((leg, i) => ({
    id: `transfer-${i}`,
    mode: "walking" as const,
    from: { legId: legs[i]!.id, end: "destination" as const },
    to: { legId: leg.id, end: "origin" as const },
  }));
  return { version: 2, kind: "guide", legs, connectors };
}

/** 10 pins at their longest labels and 9 paths: the biggest post map a rider can save. */
function maximalPostMap(pathLengths: number[]): MapData {
  return {
    version: 2,
    pins: Array.from({ length: 10 }, (_, i) => maximalPin(i)),
    paths: pathLengths.map((length, i) => fillerPath(length, i)),
  };
}

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

  it("accepts a comment with a realistic 8-leg guide of 2 m street paths", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "street_guide");
      const guide = crosstownGuide(2);

      expect(JSON.stringify(guide).length).toBeLessThan(MAP_DATA_BUDGET_BYTES);
      const res = await db.run(insertComment, [postId, rider, "Eight legs across town", JSON.stringify(guide)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("rejects the same guide with unsimplified street paths", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "dense_guide");
      const guide = crosstownGuide(null);

      const res = await db.run(insertComment, [postId, rider, "Eight dense legs", JSON.stringify(guide)]);
      expect(res).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    }));

  it("accepts the unsimplified guide once fitting has brought it under the client budget", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "fitted_guide");

      const fitted = fitGuide(crosstownGuide(null));
      expect(fitted.ok).toBe(true);
      if (!fitted.ok) return;
      expect(JSON.stringify(fitted.value).length).toBeLessThanOrEqual(MAP_DATA_BUDGET_BYTES);

      const res = await db.run(insertComment, [postId, rider, "Fitted guide", JSON.stringify(fitted.value)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("accepts a maximal guide whose JSON is exactly the client budget", () =>
    withRollback(async (db) => {
      const { rider, postId } = await riderWithPost(db, "budget_guide");
      const guide = maximalGuide(pathLengthsToBudget(8, (lengths) => jsonLength(maximalGuide(lengths))));

      expect(jsonLength(guide)).toBe(MAP_DATA_BUDGET_BYTES);
      expect(parseGuide(guide).status).toBe("ok");
      const res = await db.run(insertComment, [postId, rider, "Guide at the budget", JSON.stringify(guide)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));

  it("accepts a maximal post map whose JSON is exactly the client budget", () =>
    withRollback(async (db) => {
      const rider = await db.createRider("budget_poster");
      await db.actAs(rider);
      const map = maximalPostMap(pathLengthsToBudget(9, (lengths) => jsonLength(maximalPostMap(lengths))));

      expect(jsonLength(map)).toBe(MAP_DATA_BUDGET_BYTES);
      expect(parsePostMap(map).status).toBe("ok");
      const res = await db.run(insertPost, ["Ten pins across town", JSON.stringify(map)]);
      expect(res).toMatchObject({ ok: true, rowCount: 1 });
    }));
});
