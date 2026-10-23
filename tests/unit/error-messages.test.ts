import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
  PostgrestError,
  StorageApiError,
} from "@supabase/supabase-js";
import { StorageUnknownError } from "@supabase/storage-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { riderMessage } from "@/lib/errors";

// What postgrest-js resolves `{ error }` with: a plain object, not an Error.
function databaseError(fields: {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}) {
  return { details: null, hint: null, ...fields };
}

const NETWORK = "Couldn't reach CommuteNity. Check your connection and try again.";
const GENERIC = "Something went wrong. Please try again.";

describe("riderMessage", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  describe("database errors", () => {
    it("tells a rider their username is taken on a unique violation", () => {
      const error = databaseError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "users_username_key"',
        details: "Key (username)=(juan) already exists.",
      });

      expect(riderMessage(error)).toBe("That username is taken.");
    });

    it("tells a rider to shorten their input on a check violation", () => {
      const error = databaseError({
        code: "23514",
        message: 'new row for relation "users" violates check constraint "users_display_name_check"',
        details: "Failing row contains (…).",
      });

      expect(riderMessage(error)).toBe(
        "That didn't meet our limits. Shorten it and try again."
      );
    });

    it("tells a rider they can't do something a row-level security policy denies", () => {
      const error = databaseError({
        code: "42501",
        message: 'new row violates row-level security policy for table "posts"',
      });

      expect(riderMessage(error)).toBe("You don't have permission to do that.");
    });

    it("tells a rider when they can next change their username", () => {
      const error = databaseError({
        code: "P0001",
        message: "username_cooldown",
        hint: "Username can only be changed once every 30 days",
      });

      expect(riderMessage(error, { usernameChangeableOn: "22 November 2026" })).toBe(
        "You can change your username again on 22 November 2026."
      );
    });

    it("explains the username cooldown when the next change date is unknown", () => {
      const error = databaseError({
        code: "P0001",
        message: "username_cooldown",
        hint: "Username can only be changed once every 30 days",
      });

      expect(riderMessage(error)).toBe("Username can only be changed once every 30 days.");
    });

    it("tells a rider their photo couldn't be saved when the avatar URL is rejected", () => {
      const error = databaseError({
        code: "P0001",
        message: "avatar_url_invalid",
        hint: "Avatar must be your default placeholder or a photo in your own avatars folder",
      });

      expect(riderMessage(error)).toBe(
        "That photo couldn't be saved. Try uploading it again."
      );
    });

    it("maps a thrown PostgrestError the same as a returned one", () => {
      const error = new PostgrestError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "users_username_key"',
        details: "Key (username)=(juan) already exists.",
        hint: "",
      });

      expect(riderMessage(error)).toBe("That username is taken.");
    });

    it("does not treat an unrecognised raised exception as a known one", () => {
      const error = databaseError({ code: "P0001", message: "username_cooldown_v2" });

      expect(riderMessage(error)).toBe(GENERIC);
    });
  });

  describe("auth errors", () => {
    it("explains a sign-up the profile-creation trigger rejected", () => {
      const error = new AuthApiError("Database error saving new user", 500, "unexpected_failure");

      expect(riderMessage(error)).toBe(
        "We couldn't create your account. That username may already be taken."
      );
    });

    it("does not blame the username for other unexpected auth failures", () => {
      const error = new AuthApiError("Unexpected failure, please check server logs", 500, "unexpected_failure");

      expect(riderMessage(error)).toBe(GENERIC);
    });

    it.each([
      ["user_already_exists", "User already registered"],
      ["email_exists", "A user with this email address has already been registered"],
    ])("tells a rider the email is already registered (%s)", (code, message) => {
      const error = new AuthApiError(message, 422, code);

      expect(riderMessage(error)).toBe(
        "An account with that email already exists. Sign in instead."
      );
    });

    it("asks a rider for a stronger password", () => {
      const error = new AuthWeakPasswordError(
        "Password should be at least 8 characters.",
        422,
        ["length"]
      );

      expect(riderMessage(error)).toBe(
        "Choose a stronger password with at least 8 characters."
      );
    });

    it.each([
      ["over_email_send_rate_limit", "email rate limit exceeded"],
      ["over_request_rate_limit", "Request rate limit reached"],
    ])("asks a rider to wait when rate limited (%s)", (code, message) => {
      const error = new AuthApiError(message, 429, code);

      expect(riderMessage(error)).toBe(
        "Too many attempts. Wait a few minutes and try again."
      );
    });
  });

  describe("storage errors", () => {
    it("tells a rider their photo is too large", () => {
      const error = new StorageApiError("The object exceeded the maximum allowed size", 400, "413");

      expect(riderMessage(error)).toBe("Photo must be 5 MB or smaller.");
    });

    it("tells a rider their photo type isn't allowed", () => {
      const error = new StorageApiError("mime type image/svg+xml is not supported", 400, "415");

      expect(riderMessage(error)).toBe("Photo must be a PNG, JPEG, WebP, or GIF.");
    });

    it("tells a rider they can't upload where a storage policy denies it", () => {
      const error = new StorageApiError("new row violates row-level security policy", 400, "403");

      expect(riderMessage(error)).toBe("You don't have permission to do that.");
    });
  });

  describe("network failures", () => {
    it.each([
      ["Chromium", "Failed to fetch"],
      ["Firefox", "NetworkError when attempting to fetch resource."],
      ["Safari", "Load failed"],
    ])("tells a rider to check their connection when %s can't fetch", (_browser, message) => {
      expect(riderMessage(new TypeError(message))).toBe(NETWORK);
    });

    it("recognises a failed fetch reported by the database client", () => {
      const error = {
        message: "TypeError: Failed to fetch",
        details: "TypeError: Failed to fetch\n    at fetch (app.js:1:1)",
        hint: "",
        code: "",
      };

      expect(riderMessage(error)).toBe(NETWORK);
    });

    it("recognises a failed fetch reported by the auth client", () => {
      expect(riderMessage(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(NETWORK);
    });

    it("recognises a failed fetch reported by the storage client", () => {
      const error = new StorageUnknownError("Failed to fetch", new TypeError("Failed to fetch"));

      expect(riderMessage(error)).toBe(NETWORK);
    });

    it("does not mistake a programming error for a network failure", () => {
      const error = new TypeError("Cannot read properties of undefined (reading 'id')");

      expect(riderMessage(error)).toBe(GENERIC);
    });
  });

  describe("unknown errors", () => {
    it("shows a generic message and sends the raw error only to the console", () => {
      const error = databaseError({
        code: "XX000",
        message: "internal error: could not open relation with OID 12345",
      });

      const message = riderMessage(error);

      expect(message).toBe(GENERIC);
      expect(message).not.toContain("OID");
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
    });

    it("shows the caller's fallback message instead of the generic one", () => {
      const error = new AuthRetryableFetchError("Service Unavailable", 503);

      expect(riderMessage(error, { fallback: "Vote failed. Try again." })).toBe(
        "Vote failed. Try again."
      );
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
    });

    it("handles something that isn't an error object", () => {
      expect(riderMessage("boom")).toBe(GENERIC);
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), "boom");
    });

    it("does not log errors it recognises", () => {
      riderMessage(databaseError({ code: "23514", message: "check violation" }));

      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
