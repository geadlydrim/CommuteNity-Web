import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold">CommuteNity</h1>
        <p className="mt-2 text-muted-foreground">Welcome, {user.email}</p>
        <form action="/auth/sign-out" method="post" className="mt-6">
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">CommuteNity</h1>
      <p className="mt-2 text-lg text-muted-foreground text-center max-w-md">
        Community-driven commute navigation for the Philippines.
        Find jeepney routes, stops, and fares — contributed by riders like you.
      </p>
      <div className="mt-8 flex gap-4">
        <Button asChild>
          <Link href="/sign-up">Get started</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
