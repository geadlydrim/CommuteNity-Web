import { describe, expect, it } from "vitest";
import { nextVote } from "@/lib/posts/votes";

// Starting total 5 in every case.
const table = [
  { current: null, pressed: 1, total: 6, vote: 1 },
  { current: null, pressed: -1, total: 4, vote: -1 },
  { current: 1, pressed: 1, total: 4, vote: null },
  { current: 1, pressed: -1, total: 3, vote: -1 },
  { current: -1, pressed: 1, total: 7, vote: 1 },
  { current: -1, pressed: -1, total: 6, vote: null },
] as const;

describe("nextVote", () => {
  it.each(table)("from $current pressing $pressed → $total / $vote", ({ current, pressed, total, vote }) => {
    expect(nextVote({ total: 5, current, pressed })).toEqual({ total, vote });
  });

  it("rapid up/down/up ends up voted with the up total", () => {
    let state = { total: 5, vote: null as 1 | -1 | null };
    for (const pressed of [1, -1, 1] as const) {
      state = nextVote({ total: state.total, current: state.vote, pressed });
    }
    expect(state).toEqual({ total: 6, vote: 1 });
  });
});
