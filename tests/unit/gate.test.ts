import { describe, expect, it } from "vitest";
import { gateDecision, type GateDecision } from "@/lib/identity";

type Viewer = "signed out" | "with username" | "without username";

const viewers: Record<Viewer, { signedIn: boolean; hasUsername: boolean }> = {
  "signed out": { signedIn: false, hasUsername: false },
  "with username": { signedIn: true, hasUsername: true },
  "without username": { signedIn: true, hasUsername: false },
};

// Expected decision for a signed-in rider without a username; everyone else is allowed.
const paths: [pathname: string, withoutUsername: GateDecision][] = [
  ["/", "onboarding"],
  ["/p/x", "onboarding"],
  ["/u/x", "onboarding"],
  ["/onboarding/username", "allow"],
  ["/auth/callback", "allow"],
  ["/sign-in", "allow"],
  ["/sign-up", "allow"],
];

describe("gateDecision", () => {
  for (const [pathname, withoutUsername] of paths) {
    describe(pathname, () => {
      for (const [viewer, flags] of Object.entries(viewers)) {
        const expected = viewer === "without username" ? withoutUsername : "allow";

        it(`${viewer} → ${expected}`, () => {
          expect(gateDecision({ pathname, ...flags })).toBe(expected);
        });
      }
    });
  }
});
