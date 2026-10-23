/**
 * Why the OAuth callback sent a rider back to the sign-in page.
 *
 * The callback route writes one of these codes into `/sign-in?error=`, and the
 * sign-in page turns it back into rider-facing copy.
 */

export type CallbackErrorCode = "missing_code" | "oauth_failed";

const MESSAGES: Record<CallbackErrorCode, string> = {
  missing_code: "Sign-in didn't finish. Please try again.",
  oauth_failed: "Google sign-in failed. Please try again.",
};

const GENERIC = "Something went wrong signing you in. Please try again.";

/** The relative sign-in path that reports `code` to the rider. */
export function callbackErrorPath(code: CallbackErrorCode): string {
  return `/sign-in?error=${code}`;
}

function isCallbackErrorCode(code: string): code is CallbackErrorCode {
  return Object.hasOwn(MESSAGES, code);
}

/** Rider copy for an `error` query value, or null when there is none. */
export function callbackErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return isCallbackErrorCode(code) ? MESSAGES[code] : GENERIC;
}
