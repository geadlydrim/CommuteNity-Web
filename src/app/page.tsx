import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/post-composer";
import { SignedInHeader } from "@/components/signed-in-header";
import { PostFeed } from "@/components/post-feed";

function FeedSkeleton() {
  return (
    <ul className="w-full max-w-[--content-sm] space-y-3">
      {[1, 2, 3].map((i) => (
        <li key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex justify-between">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
          <div className="mt-3 h-4 w-full rounded bg-muted animate-pulse" />
          <div className="mt-2 h-4 w-3/4 rounded bg-muted animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

async function AuthArea() {
  let user = null;

  try {
    const supabase = await createClient();
    const { data } = await withTimeout(
      supabase.auth.getUser(),
      2000,
      "landing getUser",
    );
    user = data.user;
  } catch (err) {
    console.error("[Supabase] Landing auth check failed:", err);
  }

  if (user) {
    const supabase = await createClient();
    const { data: me } = await supabase
      .from("users")
      .select("username, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    return (
      <>
        <SignedInHeader
          username={me?.username ?? null}
          avatarUrl={me?.avatar_url ?? null}
          displayName={me?.display_name ?? null}
        />
        <div className="flex flex-col items-center gap-6 px-8 pt-8 pb-16">
          <PostComposer avatarUrl={me?.avatar_url ?? null} displayName={me?.display_name ?? null} />
          <Suspense fallback={<FeedSkeleton />}>
            <PostFeed />
          </Suspense>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col items-center px-8 pt-16 pb-16">
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
      <div className="mt-10 w-full flex flex-col items-center gap-6">
        <Suspense fallback={<FeedSkeleton />}>
          <PostFeed />
        </Suspense>
      </div>
    </div>
  );
}

function AuthAreaSkeleton() {
  return (
    <div className="flex flex-col items-center px-8 pt-16 pb-16">
      <h1 className="text-4xl font-bold">CommuteNity</h1>
      <p className="mt-2 text-lg text-muted-foreground text-center max-w-md">
        Community-driven commute navigation for the Philippines.
        Find jeepney routes, stops, and fares — contributed by riders like you.
      </p>
      <div className="mt-8 flex gap-4">
        <div className="h-8 w-28 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<AuthAreaSkeleton />}>
        <AuthArea />
      </Suspense>
    </main>
  );
}
