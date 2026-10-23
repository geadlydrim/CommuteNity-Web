"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usernameSchema, displayNameSchema } from "@/lib/schemas/profile";
import { createClient } from "@/lib/supabase/client";
import { riderMessage } from "@/lib/errors";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  username: usernameSchema,
  display_name: displayNameSchema,
});

type FormValues = z.infer<typeof schema>;

// Mirrors the `avatars` storage bucket limits.
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_PUBLIC_PREFIX = "/storage/v1/object/public/avatars/";

/** Storage path of an avatar URL if it lives in this rider's own avatars folder. */
function ownAvatarPath(url: string | null, userId: string): string | null {
  if (!url) return null;
  let path: string;
  try {
    const pathname = new URL(url).pathname;
    const idx = pathname.indexOf(AVATAR_PUBLIC_PREFIX);
    if (idx === -1) return null;
    path = decodeURIComponent(pathname.slice(idx + AVATAR_PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
  return path.startsWith(`${userId}/`) ? path : null;
}

function canChangeUsername(usernameChangedAt: string | null): boolean {
  if (!usernameChangedAt) return true;
  const changed = new Date(usernameChangedAt);
  const cooldownEnd = new Date(changed.getTime() + 30 * 24 * 60 * 60 * 1000);
  return new Date() >= cooldownEnd;
}

function cooldownEndDate(usernameChangedAt: string): string {
  const changed = new Date(usernameChangedAt);
  const cooldownEnd = new Date(changed.getTime() + 30 * 24 * 60 * 60 * 1000);
  return cooldownEnd.toLocaleDateString();
}

export function ProfileEditDialog({
  userId,
  currentUsername,
  currentDisplayName,
  currentAvatarUrl,
  usernameChangedAt,
}: {
  userId: string;
  currentUsername: string;
  currentDisplayName: string;
  currentAvatarUrl: string | null;
  usernameChangedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usernameEditable = canChangeUsername(usernameChangedAt);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: currentUsername,
      display_name: currentDisplayName,
    },
  });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setServerError("Photo must be a PNG, JPEG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setServerError("Photo must be 5 MB or smaller.");
      return;
    }
    setServerError(null);
    setAvatarFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleClose(next: boolean) {
    if (!next && previewUrl) URL.revokeObjectURL(previewUrl);
    if (!next) {
      setAvatarFile(null);
      setPreviewUrl(null);
    }
    setOpen(next);
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = createClient();
    let newAvatarUrl: string | null = null;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setServerError(riderMessage(uploadError));
        return;
      }
      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        username: values.username,
        display_name: values.display_name,
        ...(newAvatarUrl ? { avatar_url: newAvatarUrl } : {}),
      },
    });

    if (metaError) {
      setServerError(riderMessage(metaError));
      return;
    }

    const { error: dbError } = await supabase
      .from("users")
      .update({
        username: values.username,
        display_name: values.display_name,
        ...(newAvatarUrl ? { avatar_url: newAvatarUrl } : {}),
      })
      .eq("id", userId);

    if (dbError) {
      setServerError(
        riderMessage(dbError, {
          usernameChangeableOn: usernameChangedAt
            ? cooldownEndDate(usernameChangedAt)
            : undefined,
        })
      );
      return;
    }

    if (newAvatarUrl) {
      const oldPath = ownAvatarPath(currentAvatarUrl, userId);
      if (oldPath) {
        // Best-effort cleanup of the replaced photo; failures are harmless.
        await supabase.storage.from("avatars").remove([oldPath]).catch(() => {});
      }
    }

    handleClose(false);

    if (values.username !== currentUsername) {
      router.replace(`/u/${values.username}`);
    } else {
      router.refresh();
    }
  }

  const displayedAvatar = previewUrl ?? currentAvatarUrl;
  const displayName = form.watch("display_name") || currentDisplayName;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleClose(true)}>
        Edit profile
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Change avatar"
                >
                  <UserAvatar
                    src={displayedAvatar}
                    name={displayName}
                    className="h-20 w-20 cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
                  />
                </button>
                <p className="text-xs text-muted-foreground">Click to change photo</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_AVATAR_TYPES.join(",")}
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="yourhandle"
                        disabled={!usernameEditable}
                        {...field}
                      />
                    </FormControl>
                    {!usernameEditable && usernameChangedAt && (
                      <p className="text-xs text-muted-foreground">
                        Available to change on {cooldownEndDate(usernameChangedAt)}.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && (
                <p className="text-sm text-destructive">{serverError}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
