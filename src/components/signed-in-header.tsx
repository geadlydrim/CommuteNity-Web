import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="feed-col flex items-center justify-between gap-2 py-3">
        <Link
          href="/"
          className="font-heading shrink-0 text-lg font-bold tracking-tight"
        >
          CommuteNity
        </Link>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          {username ? (
            <Link
              href={`/u/${username}`}
              className="flex min-w-0 items-center gap-2 hover:underline"
            >
              <UserAvatar
                src={avatarUrl}
                name={displayName ?? username}
                className="h-7 w-7 shrink-0"
              />
              <span className="hidden truncate text-sm font-medium sm:inline">
                @{username}
              </span>
            </Link>
          ) : (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              No handle set
            </span>
          )}
          <ThemeToggle />
          <form action="/auth/sign-out" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
