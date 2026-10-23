import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/identity";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[OAuth] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/sign-in?error=oauth_failed`);
  }

  let viewer: Viewer | null;
  try {
    viewer = await getViewer(supabase);
  } catch (err) {
    // The middleware gate checks the username again on the next request.
    console.error("[OAuth] Reading the rider's profile failed:", err);
    return NextResponse.redirect(`${origin}/`);
  }

  if (!viewer?.username) {
    return NextResponse.redirect(`${origin}/onboarding/username`);
  }
  return NextResponse.redirect(`${origin}/`);
}
