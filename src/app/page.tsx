import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <div className="feed-col flex flex-col items-center pt-10 pb-4 lg:pt-16">
      <h1 className="text-3xl font-bold sm:text-4xl">CommuteNity</h1>
      <p className="mt-2 text-center text-base text-muted-foreground sm:text-lg">
        Community-driven commute navigation for the Philippines.
        Find jeepney routes, stops, and fares — contributed by riders like you.
      </p>
      <div className="mt-8 flex w-full max-w-sm gap-3">{children}</div>
    </div>
  );
}

/** Shown when the session check fails, so an outage never looks like a sign-out. */
function SessionUnconfirmed() {
  return (
    <div
      role="status"
      className="feed-col flex items-center justify-between gap-3 pt-6 lg:pt-8"
    >
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t confirm you&apos;re signed in.
      </p>
      {/* A native GET reloads the page, so the session check runs again. */}
      <form action="/">
        <Button type="submit" variant="outline" size="sm">
          Retry
        </Button>
      </form>
    </div>
  );
}

async function ViewerArea() {
  let viewer: Viewer | null;
  try {
    const supabase = await createClient();
    viewer = await getViewer(supabase);
  } catch (err) {
    unstable_rethrow(err);
    console.error("[Supabase] Landing auth check failed:", err);
    return <SessionUnconfirmed />;
  }

  if (viewer) {
    return (
      <>
        <SignedInHeader
          username={viewer.username}
          avatarUrl={viewer.avatarUrl}
          displayName={viewer.displayName}
        />
        <div className="feed-col pt-4 lg:pt-8">
          <PostComposer avatarUrl={viewer.avatarUrl} displayName={viewer.displayName} />
        </div>
      </>
    );
  }

  return (
    <Hero>
      <Button asChild className="flex-1">
        <Link href="/sign-up">Get started</Link>
      </Button>
      <Button asChild variant="outline" className="flex-1">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    </Hero>
  );
}

function ViewerAreaSkeleton() {
  return (
    <Hero>
      <div className="h-8 flex-1 rounded-lg bg-muted animate-pulse" />
      <div className="h-8 flex-1 rounded-lg bg-muted animate-pulse" />
    </Hero>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<ViewerAreaSkeleton />}>
        <ViewerArea />
      </Suspense>
      {/* One feed tree for every viewer state; it streams independently of the session check. */}
      <div className="feed-col flex flex-col gap-6 pt-6 pb-12 lg:pb-16">
        <Suspense fallback={<FeedSkeleton />}>
          <PostFeed />
        </Suspense>
      </div>
    </main>
  );
}
