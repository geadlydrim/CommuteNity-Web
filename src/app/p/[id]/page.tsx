import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPostById } from "@/lib/posts";
import { FocusView } from "@/components/focus-view";

type Params = { params: Promise<{ id: string }> };

// One fetch per request, shared by generateMetadata and the page.
const loadPost = cache(async (id: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const post = await getPostById(supabase, id, currentUserId);
  return { post, currentUserId };
});

/** The body on one line, cut to `max` characters with an ellipsis. */
function excerpt(body: string, max: number): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const { post } = await loadPost(id);
  if (!post) return {};

  const title = `${excerpt(post.body, 60)} · CommuteNity`;
  const name = post.author?.display_name ?? null;
  const authorTag = post.author?.username ? `@${post.author.username}` : null;
  const by = name && authorTag ? `${name} (${authorTag})` : (name ?? authorTag ?? "A rider");
  const description = `${by}: ${excerpt(post.body, 160)}`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article", publishedTime: post.created_at },
  };
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const { post, currentUserId } = await loadPost(id);

  if (!post) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 pt-8 pb-12 lg:pt-12 lg:pb-16">
      <div className="feed-col flex items-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to feed
        </Link>
      </div>
      <FocusView post={post} currentUserId={currentUserId} className="feed-col" />
    </main>
  );
}
