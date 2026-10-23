import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/identity";
import { callbackErrorPath } from "@/lib/auth-callback";

// Relative Locations only: an origin taken from the request could be spoofed.
function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return redirectTo(callbackErrorPath("missing_code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[OAuth] exchangeCodeForSession failed:", error.message);
    return redirectTo(callbackErrorPath("oauth_failed"));
  }

  let viewer: Viewer | null;
  try {
    viewer = await getViewer(supabase);
  } catch (err) {
    // The middleware gate checks the username again on the next request.
    console.error("[OAuth] Reading the rider's profile failed:", err);
    return redirectTo("/");
  }

  if (!viewer?.username) {
    return redirectTo("/onboarding/username");
  }
  return redirectTo("/");
}
