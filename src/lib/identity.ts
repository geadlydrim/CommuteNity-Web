/**
 * Who the viewer is, and whether they may use the app yet.
 *
 * `public.users` is the only source of a rider's username, display name, and
 * avatar. Sign-up metadata is input to the `handle_new_user` trigger only and
 * is never read back for identity (ADR 0006).
 */
import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type Viewer = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  usernameChangedAt: string | null;
};

/**
 * The signed-in rider and their `users` row, or null when signed out.
 * Throws if the session check can't reach Supabase (network failure, timeout,
 * or server error) or the `users` read fails, so callers never mistake an
 * outage for a signed-out rider or a rider without a username.
 */
export async function getViewer(
  supabase: SupabaseClient<Database>,
): Promise<Viewer | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError && isAuthRetryableFetchError(authError)) throw authError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("username, display_name, avatar_url, username_changed_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  return {
    id: user.id,
    username: data?.username ?? null,
    displayName: data?.display_name ?? null,
    avatarUrl: data?.avatar_url ?? null,
    usernameChangedAt: data?.username_changed_at ?? null,
  };
}

export type GateDecision = "allow" | "onboarding";

/** Paths a signed-in rider may visit before picking a username. */
function allowedWithoutUsername(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/sign-in" ||
    pathname === "/sign-up"
  );
}

/** Whether a request may proceed, or the rider must pick a username first. */
export function gateDecision({
  pathname,
  signedIn,
  hasUsername,
}: {
  pathname: string;
  signedIn: boolean;
  hasUsername: boolean;
}): GateDecision {
  if (!signedIn || hasUsername || allowedWithoutUsername(pathname)) {
    return "allow";
  }
  return "onboarding";
}
