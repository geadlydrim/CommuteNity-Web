import Link from "next/link";

export type PostCardData = {
  id: string;
  body: string;
  created_at: string;
  users:
    | { username: string | null; display_name: string | null }
    | { username: string | null; display_name: string | null }[]
    | null;
};

export function PostCard({ post }: { post: PostCardData }) {
  const raw = post.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  const display = u?.display_name ?? "Unknown user";
  const handle = u?.username ?? null;

  const authorNode = (
    <span>
      <span className="font-medium">{display}</span>
      {handle && <span className="ml-1 text-muted-foreground">@{handle}</span>}
    </span>
  );

  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">
          {handle ? (
            <Link href={`/u/${handle}`} className="hover:underline">
              {authorNode}
            </Link>
          ) : (
            authorNode
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{post.body}</p>
    </li>
  );
}
