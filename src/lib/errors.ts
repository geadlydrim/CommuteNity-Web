/**
 * Turns Supabase database, storage, and auth errors into rider-facing copy.
 *
 * Errors are recognised by their codes and by the named exceptions the
 * database raises, never by loose text matching. Anything unrecognised gets a
 * generic message, and the raw error goes only to the console (logged here,
 * so callers never log it themselves).
 */

export type RiderMessageOptions = {
  /** Message for errors this module doesn't recognise. */
  fallback?: string;
  /** Formatted date the rider can next change their username. */
  usernameChangeableOn?: string;
};

const GENERIC = "Something went wrong. Please try again.";
const NETWORK = "Couldn't reach CommuteNity. Check your connection and try again.";
const NOT_ALLOWED = "You don't have permission to do that.";
const USERNAME_TAKEN = "That username is taken.";
const OVER_LIMITS = "That didn't meet our limits. Shorten it and try again.";
const USERNAME_COOLDOWN = "Username can only be changed once every 30 days.";
const AVATAR_INVALID = "That photo couldn't be saved. Try uploading it again.";
const PHOTO_TYPE = "Photo must be a PNG, JPEG, WebP, or GIF.";
const PHOTO_SIZE = "Photo must be 5 MB or smaller.";
const SIGN_UP_FAILED =
  "We couldn't create your account. That username may already be taken.";
const EMAIL_TAKEN = "An account with that email already exists. Sign in instead.";
const WEAK_PASSWORD = "Choose a stronger password with at least 8 characters.";
const RATE_LIMITED = "Too many attempts. Wait a few minutes and try again.";

// What the browser's fetch rejects with when the network is unreachable.
const FETCH_FAILURE_MESSAGES: Record<string, true> = {
  "Failed to fetch": true, // Chromium
  "NetworkError when attempting to fetch resource.": true, // Firefox
  "Load failed": true, // Safari
  "fetch failed": true, // Node (undici)
};

// GoTrue's reply when the profile-creation trigger rejects a new user.
const GOTRUE_SIGN_UP_TRIGGER_FAILURE = "Database error saving new user";

type ErrorFields = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  originalError?: unknown;
};

function isFetchFailure(error: unknown): boolean {
  if (error instanceof TypeError) return FETCH_FAILURE_MESSAGES[error.message] === true;
  if (typeof error !== "object" || error === null) return false;
  const { name, message, code, status, originalError } = error as ErrorFields;
  // auth-js wraps a rejected fetch in AuthRetryableFetchError with status 0.
  if (name === "AuthRetryableFetchError") return status === 0;
  // storage-js wraps it in StorageUnknownError, keeping the original TypeError.
  if (name === "StorageUnknownError") return isFetchFailure(originalError);
  // postgrest-js resolves with { code: "", message: "TypeError: Failed to fetch" }.
  if (code === "" && typeof message === "string" && message.startsWith("TypeError: ")) {
    return FETCH_FAILURE_MESSAGES[message.slice("TypeError: ".length)] === true;
  }
  return false;
}

function authMessage({ code, message }: ErrorFields): string | null {
  switch (code) {
    case "unexpected_failure":
      return message === GOTRUE_SIGN_UP_TRIGGER_FAILURE ? SIGN_UP_FAILED : null;
    case "user_already_exists":
    case "email_exists":
      return EMAIL_TAKEN;
    case "weak_password":
      return WEAK_PASSWORD;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return RATE_LIMITED;
    default:
      return null;
  }
}

function storageMessage({ statusCode }: ErrorFields): string | null {
  switch (statusCode) {
    case "403":
      return NOT_ALLOWED;
    case "413":
      return PHOTO_SIZE;
    case "415":
      return PHOTO_TYPE;
    default:
      return null;
  }
}

function databaseMessage(
  { code, message }: ErrorFields,
  options: RiderMessageOptions
): string | null {
  switch (code) {
    case "23505":
      return USERNAME_TAKEN;
    case "23514":
      return OVER_LIMITS;
    case "42501":
      return NOT_ALLOWED;
    // RAISE EXCEPTION without an explicit SQLSTATE.
    case "P0001":
      if (message === "username_cooldown") {
        return options.usernameChangeableOn
          ? `You can change your username again on ${options.usernameChangeableOn}.`
          : USERNAME_COOLDOWN;
      }
      if (message === "avatar_url_invalid") return AVATAR_INVALID;
      return null;
    default:
      return null;
  }
}

function knownMessage(error: unknown, options: RiderMessageOptions): string | null {
  if (isFetchFailure(error)) return NETWORK;
  if (typeof error !== "object" || error === null) return null;
  const fields = error as ErrorFields;
  if ("__isAuthError" in error) return authMessage(fields);
  if ("__isStorageError" in error) return storageMessage(fields);
  return databaseMessage(fields, options);
}

/** Plain-language message for a failed Supabase call, safe to show a rider. */
export function riderMessage(error: unknown, options: RiderMessageOptions = {}): string {
  const known = knownMessage(error, options);
  if (known) return known;
  console.error("[riderMessage] unmapped error:", error);
  return options.fallback ?? GENERIC;
}
