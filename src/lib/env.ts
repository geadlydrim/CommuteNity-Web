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

let cachedGeocoderUserAgent: string | undefined;

/** `Name/version (contact)`, where contact is a URL or email. */
const USER_AGENT_PATTERN = /^\S+\/\S+.*\((?:[^()]*(?:https?:\/\/|@)[^()]*)\)/;

/**
 * Server-only. User agent sent to the upstream geocoder.
 * Nominatim's usage policy requires an identifying agent with contact details,
 * so production must set GEOCODER_USER_AGENT. Validates once and caches.
 */
export function geocoderUserAgent(): string {
  if (cachedGeocoderUserAgent) return cachedGeocoderUserAgent;
  // Blank counts as unset: CI and hosting dashboards often define an empty value.
  const raw = process.env.GEOCODER_USER_AGENT?.trim() || undefined;
  let value: string;
  if (raw === undefined) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Invalid environment variables:\n- GEOCODER_USER_AGENT is missing; production requires an identifying user agent like \"CommuteNity/1.0 (https://example.com)\"",
      );
    }
    value = DEFAULT_GEOCODER_USER_AGENT;
  } else {
    value = raw;
    if (!USER_AGENT_PATTERN.test(value)) {
      throw new Error(
        "Invalid environment variables:\n- GEOCODER_USER_AGENT must look like \"Name/version (contact)\" with a URL or email contact",
      );
    }
  }
  cachedGeocoderUserAgent = value;
  return value;
}
