"use client";

import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { PostCard, type PostCardData } from "@/components/post-card";
import { DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  post: PostCardData;
  initialUserVote: 1 | -1 | null;
  currentUserId: string | null;
};

export function PostModal({ post, initialUserVote, currentUserId }: Props) {
  const router = useRouter();

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) router.back(); }}>
      <DialogPortal>
        {/* Dark blurred overlay — override the default light one */}
        <DialogOverlay className="bg-black/75 supports-backdrop-filter:backdrop-blur-sm" />

        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-none bg-popover text-popover-foreground outline-none ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[90vh] sm:w-[min(40rem,calc(100%-2rem))] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:shadow-xl lg:w-[40%] sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95"
        >
          {/* Visually-hidden title for Radix a11y */}
          <DialogTitle className="sr-only">Post</DialogTitle>

          {/* Close button */}
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-10"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>

          {/* PostCard needs a <ul> parent since it renders <li> */}
          <ul className="px-3 pt-10 pb-3 sm:p-0">
            <PostCard
              post={post}
              initialUserVote={initialUserVote}
              currentUserId={currentUserId}
              focusMode
            />
          </ul>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
