import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Mirrors the `avatars` storage bucket limits. */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const AVATAR_PUBLIC_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

/** File extension for an allowed avatar MIME type, or null if unsupported. */
export function extensionForType(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

/** Storage path of an avatar URL if it lives in this rider's own avatars folder. */
export function ownAvatarPath(url: string | null, riderId: string): string | null {
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
  return path.startsWith(`${riderId}/`) ? path : null;
}

/** A fresh, unique storage path in the rider's folder; null for unsupported types. */
export function avatarPath(riderId: string, mime: string): string | null {
  const ext = extensionForType(mime);
  return ext ? `${riderId}/avatar-${Date.now()}.${ext}` : null;
}

export type ReplaceAvatarResult = { ok: true } | { ok: false; error: unknown };

/**
 * Upload the new photo, then run the profile update with its public URL.
 * If the update fails, the new upload is removed and the update error returned;
 * if it succeeds, the previous own-folder photo is removed. Cleanup is best-effort.
 */
export async function replaceAvatar(
  supabase: SupabaseClient<Database>,
  {
    riderId,
    file,
    previousUrl,
    saveProfile,
  }: {
    riderId: string;
    file: File;
    previousUrl: string | null;
    saveProfile: (avatarUrl: string) => Promise<{ error: unknown }>;
  }
): Promise<ReplaceAvatarResult> {
  const path = avatarPath(riderId, file.type);
  if (!path) return { ok: false, error: new Error("Unsupported photo type") };

  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file);
  if (uploadError) return { ok: false, error: uploadError };

  const avatarUrl = bucket.getPublicUrl(path).data.publicUrl;
  const { error } = await saveProfile(avatarUrl);
  if (error) {
    await bucket.remove([path]).catch(() => {});
    return { ok: false, error };
  }

  const oldPath = ownAvatarPath(previousUrl, riderId);
  if (oldPath && oldPath !== path) await bucket.remove([oldPath]).catch(() => {});
  return { ok: true };
}
