// Regenerates src/lib/supabase/database.types.ts from the database at
// SUPABASE_DB_URL, using the same introspection and TypeScript generator as
// `supabase gen types`, but without Docker or Management API access.
// Run with: npm run db:types   (reads .env.local)
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { createNodeHost, findLanguage, introspect } from "@supabase/typegen";

const OUTPUT = "src/lib/supabase/database.types.ts";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is not set (see .env.example).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const typescript = findLanguage("typescript");
  const metadata = await introspect(pool, { includedSchemas: ["public"] });
  // Identity formatter: the default needs the optional oxfmt peer. Generated file, not hand-edited.
  const host = createNodeHost({ cwd: process.cwd(), format: (code) => code });
  const code = await typescript.generate(metadata, {}, host);
  await writeFile(OUTPUT, code);
  console.log(`Wrote ${OUTPUT}`);
} finally {
  await pool.end();
}
