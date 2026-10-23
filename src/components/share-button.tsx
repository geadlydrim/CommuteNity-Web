"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  postId: string;
  /** Text offered alongside the link in the native share sheet. */
  text: string;
};

export function ShareButton({ postId, text }: Props) {
  async function share() {
    const url = `${window.location.origin}/p/${postId}`;
    if (typeof navigator.share !== "undefined") {
      try {
        await navigator.share({ url, text });
        return;
      } catch (error) {
        // The rider closed the share sheet: nothing to do.
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Sharing failed for another reason — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy link.");
    }
  }

  return (
    <button
      onClick={share}
      className="flex min-h-11 min-w-11 items-center justify-center text-xs transition-colors hover:text-foreground"
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}
