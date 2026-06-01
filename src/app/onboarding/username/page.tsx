import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingUsernamePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const username = user.user_metadata?.username as string | undefined;
  if (username) redirect("/");

  const googleName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <OnboardingForm defaultDisplayName={googleName} userId={user.id} />
    </main>
  );
}
