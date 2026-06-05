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

        {/* Wide centered content panel */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-xl duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 overflow-y-auto max-h-[90vh]"
        >
          {/* Visually-hidden title for Radix a11y */}
          <DialogTitle className="sr-only">Post</DialogTitle>

          {/* Close button */}
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 z-10"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>

          {/* PostCard needs a <ul> parent since it renders <li> */}
          <ul>
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
