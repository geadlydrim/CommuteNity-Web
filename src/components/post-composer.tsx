"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PostComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = text.trim();

  async function handlePost() {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("posts").insert({ body: trimmed });
    if (error) {
      console.error("[Post] insert failed:", error);
      toast.error("Failed to post. Try again.");
    } else {
      setText("");
      toast.success("Posted!");
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <div className="w-[40vw] rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm">
      <div className="size-10 shrink-0 rounded-full bg-muted" aria-hidden />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening on your commute?"
        className="flex-1"
        disabled={submitting}
      />
      <Button onClick={handlePost} disabled={!trimmed || submitting}>
        {submitting ? "Posting…" : "Post"}
      </Button>
    </div>
  );
}
