import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SignedInHeader({ username }: { username: string | null }) {
  return (
    <header className="flex items-center justify-end gap-3 p-4">
      {username ? (
        <Link href={`/u/${username}`} className="text-sm font-medium hover:underline">
          @{username}
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
