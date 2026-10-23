import { describe, expect, it } from "vitest";
import { callbackErrorMessage, callbackErrorPath } from "@/lib/auth-callback";

describe("OAuth callback errors", () => {
  it.each([
    ["missing_code", "Sign-in didn't finish. Please try again."],
    ["oauth_failed", "Google sign-in failed. Please try again."],
  ] as const)("tells the rider what %s means", (code, message) => {
    expect(callbackErrorMessage(code)).toBe(message);
  });

  it.each(["access_denied", "constructor", "__proto__"])(
    "gives an unknown code (%s) the generic message",
    (code) => {
      expect(callbackErrorMessage(code)).toBe(
        "Something went wrong signing you in. Please try again.",
      );
    },
  );

  it("shows nothing when there is no error", () => {
    expect(callbackErrorMessage(null)).toBeNull();
    expect(callbackErrorMessage("")).toBeNull();
  });

  it.each(["missing_code", "oauth_failed"] as const)(
    "sends %s back to the sign-in page",
    (code) => {
      expect(callbackErrorPath(code)).toBe(`/sign-in?error=${code}`);
    },
  );
});
