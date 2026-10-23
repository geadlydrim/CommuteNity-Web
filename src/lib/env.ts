import { z } from "zod";

const DEFAULT_GEOCODER_USER_AGENT = "CommuteNity/0.1 (dev)";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL is missing or not a valid URL",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing" })
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is empty" }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | undefined;

/**
 * Validated public environment, usable in browser and server code.
 * Validates on first call and caches the result.
 */
export function publicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;
  // Literal references so Next.js inlines them into browser bundles.
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `- ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Server-only. User agent sent to the upstream geocoder. */
export function geocoderUserAgent(): string {
  const value = process.env.GEOCODER_USER_AGENT?.trim();
  return value ? value : DEFAULT_GEOCODER_USER_AGENT;
}
