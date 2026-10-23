import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout } from "@/lib/supabase/with-timeout";
import { gateDecision, getViewer, type Viewer } from "@/lib/identity";

type CookieWrite = Parameters<SetAllCookies>[0][number];

export async function updateSession(request: NextRequest) {
  // Session cookie writes are held back until the session check succeeds, so
  // a timeout or network failure never touches the rider's cookies.
  const cookieWrites = new Map<string, CookieWrite>();
  const cookieHeaders = new Map<string, string>();

  const supabase = createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const cookie of cookiesToSet) cookieWrites.set(cookie.name, cookie);
          for (const [name, value] of Object.entries(headers)) {
            cookieHeaders.set(name, value);
          }
        },
      },
    }
  );

  let viewer: Viewer | null;
  try {
    viewer = await getViewer(supabase);
  } catch (err) {
    // Couldn't confirm the session: pass the request through untouched rather
    // than signing the rider out or trapping them behind onboarding.
    console.error("[Supabase] Middleware session check failed:", err);
    return NextResponse.next({ request });
  }

  for (const { name, value } of cookieWrites.values()) {
    request.cookies.set(name, value);
  }

  const decision = gateDecision({
    pathname: request.nextUrl.pathname,
    signedIn: viewer !== null,
    hasUsername: Boolean(viewer?.username),
  });
  let response: NextResponse;
  if (decision === "onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding/username";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request });
  }

  for (const { name, value, options } of cookieWrites.values()) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of cookieHeaders) response.headers.set(name, value);
  return response;
}
