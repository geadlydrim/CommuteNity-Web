import { createClient } from "@/lib/supabase/server";

/** Signs out this device only, then sends the rider to the feed. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
