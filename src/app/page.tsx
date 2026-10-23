import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { getViewer, type Viewer } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/post-composer";
import { SignedInHeader } from "@/components/signed-in-header";
import { PostFeed } from "@/components/post-feed";

function FeedSkeleton() {
  return (
    <ul className="w-full space-y-3">
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
  let viewer: Viewer | null = null;

  try {
    const supabase = await createClient();
    viewer = await withTimeout(getViewer(supabase), 2000, "landing getViewer");
  } catch (err) {
    unstable_rethrow(err);
    console.error("[Supabase] Landing auth check failed:", err);
  }

  if (viewer) {
    return (
      <>
        <SignedInHeader
          username={viewer.username}
          avatarUrl={viewer.avatarUrl}
          displayName={viewer.displayName}
        />
        <div className="feed-col flex flex-col gap-6 pt-4 pb-12 lg:pt-8 lg:pb-16">
          <PostComposer avatarUrl={viewer.avatarUrl} displayName={viewer.displayName} />
          <Suspense fallback={<FeedSkeleton />}>
            <PostFeed />
          </Suspense>
        </div>
      </>
    );
  }

  return (
    <div className="feed-col flex flex-col items-center pt-10 pb-12 lg:pt-16 lg:pb-16">
      <h1 className="text-3xl font-bold sm:text-4xl">CommuteNity</h1>
      <p className="mt-2 text-center text-base text-muted-foreground sm:text-lg">
        Community-driven commute navigation for the Philippines.
        Find jeepney routes, stops, and fares — contributed by riders like you.
      </p>
      <div className="mt-8 flex w-full max-w-sm gap-3">
        <Button asChild className="flex-1">
          <Link href="/sign-up">Get started</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
      <div className="mt-10 flex w-full flex-col gap-6">
        <Suspense fallback={<FeedSkeleton />}>
          <PostFeed />
        </Suspense>
      </div>
    </div>
  );
}

function AuthAreaSkeleton() {
  return (
    <div className="feed-col flex flex-col items-center pt-10 pb-12 lg:pt-16 lg:pb-16">
      <h1 className="text-3xl font-bold sm:text-4xl">CommuteNity</h1>
      <p className="mt-2 text-center text-base text-muted-foreground sm:text-lg">
        Community-driven commute navigation for the Philippines.
        Find jeepney routes, stops, and fares — contributed by riders like you.
      </p>
      <div className="mt-8 flex w-full max-w-sm gap-3">
        <div className="h-8 flex-1 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 flex-1 rounded-lg bg-muted animate-pulse" />
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
