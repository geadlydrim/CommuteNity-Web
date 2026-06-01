import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";

export type PostCardData = {
  id: string;
  body: string;
  created_at: string;
  users:
    | { username: string | null; display_name: string | null; avatar_url: string | null }
    | { username: string | null; display_name: string | null; avatar_url: string | null }[]
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserAvatar src={u?.avatar_url ?? null} name={display} className="h-8 w-8" />
          <p className="text-sm">
            {handle ? (
              <Link href={`/u/${handle}`} className="hover:underline">
                {authorNode}
              </Link>
            ) : (
              authorNode
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{post.body}</p>
    </li>
  );
}
