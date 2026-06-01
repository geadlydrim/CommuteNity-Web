import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string | null;
  className?: string;
}) {
  const fallback = name?.trim()[0]?.toUpperCase() ?? "?";
  return (
    <Avatar className={cn(className)}>
      {src && <AvatarImage src={src} alt={name ?? "avatar"} />}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
