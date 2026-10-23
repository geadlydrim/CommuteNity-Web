import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/auth/sign-out/route";

const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn<(options?: { scope?: string }) => Promise<{ error: null }>>(
    async () => ({ error: null }),
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}));

describe("sign-out", () => {
  it("signs out only this session and sends the rider to the feed with 303", async () => {
    const res = await POST();

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toMatch(/\/$/);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
});
