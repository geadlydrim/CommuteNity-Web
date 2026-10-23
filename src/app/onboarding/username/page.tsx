import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/identity";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingUsernamePage() {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);

  if (!viewer) redirect("/sign-in");
  if (viewer.username) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
      <OnboardingForm
        defaultDisplayName={viewer.displayName ?? ""}
        userId={viewer.id}
      />
    </main>
  );
}
