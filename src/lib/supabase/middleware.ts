import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { NextResponse, type NextRequest } from "next/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { gateDecision } from "@/lib/identity";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await withTimeout(
      supabase.auth.getUser(),
      2000,
      "middleware getUser"
    );
    user = data?.user ?? null;
  } catch (err) {
    console.error("[Supabase] Middleware auth refresh failed:", err);
  }

  if (user) {
    let hasUsername: boolean;
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase.from("users").select("username").eq("id", user.id).maybeSingle()
        ),
        2000,
        "middleware username read"
      );
      if (error) throw error;
      hasUsername = Boolean(data?.username);
    } catch (err) {
      // Don't trap riders behind onboarding when the database is unreachable.
      console.error("[Supabase] Middleware username read failed:", err);
      return supabaseResponse;
    }

    const decision = gateDecision({
      pathname: request.nextUrl.pathname,
      signedIn: true,
      hasUsername,
    });
    if (decision === "onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/username";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
