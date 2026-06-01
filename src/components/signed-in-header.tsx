import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

export function SignedInHeader({
  username,
  avatarUrl,
  displayName,
}: {
  username: string | null;
  avatarUrl: string | null;
  displayName: string | null;
}) {
  return (
    <header className="flex items-center justify-end gap-3 p-4">
      {username ? (
        <Link href={`/u/${username}`} className="flex items-center gap-2 hover:underline">
          <UserAvatar src={avatarUrl} name={displayName ?? username} className="h-7 w-7" />
          <span className="text-sm font-medium">@{username}</span>
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">No handle set</span>
      )}
      <form action="/auth/sign-out" method="post">
        <Button type="submit" variant="outline" size="sm">Sign out</Button>
      </form>
    </header>
  );
}
