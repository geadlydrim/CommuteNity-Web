import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username = user?.user_metadata?.username as string | undefined;

  if (!username) {
    return NextResponse.redirect(`${origin}/onboarding/username`);
  }
  return NextResponse.redirect(`${origin}/`);
}
