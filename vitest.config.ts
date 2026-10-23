import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // .env.local supplies SUPABASE_DB_URL for the database tests.
    env: loadEnv(mode, process.cwd(), ""),
    // Database tests share one remote project; keep them sequential.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
