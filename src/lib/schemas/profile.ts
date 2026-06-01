import { z } from "zod";

export const usernameSchema = z
  .string()
  .regex(
    /^[a-z0-9_]{3,20}$/,
    "3–20 lowercase letters, numbers, or underscores"
  )
  .transform((s) => s.toLowerCase());

export const displayNameSchema = z
  .string()
  .min(1, "Enter a display name")
  .max(40, "Display name must be 40 characters or less");
