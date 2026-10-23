/**
 * Database seam: run statements as a signed-in rider inside a transaction that
 * is always rolled back, so tests leave no data behind in the linked project.
 *
 * Set DB_TEST_MIGRATION=<path to .sql> to apply an unpushed migration inside
 * each test's transaction first (useful when no local database is available).
 */
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
export const hasDb = Boolean(connectionString);

let pool: Pool | undefined;
function getPool(): Pool {
  pool ??= new Pool({ connectionString, max: 1 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type Outcome =
  | { ok: true; rowCount: number; rows: Record<string, unknown>[] }
  | { ok: false; code: string | undefined; message: string };

export interface Db {
  /** Create a rider (auth user + profile via handle_new_user). Runs as admin. */
  createRider(username: string): Promise<string>;
  /** Run following statements as this rider (role `authenticated`). */
  actAs(riderId: string): Promise<void>;
  /** Run following statements as the migration role. */
  actAsAdmin(): Promise<void>;
  /** Run one statement; failures are returned, not thrown, and don't abort the transaction. */
  run(sql: string, params?: unknown[]): Promise<Outcome>;
  /** Run one statement that must succeed and return its rows. */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function withRollback(fn: (db: Db) => Promise<void>): Promise<void> {
  const client = await getPool().connect();
  await client.query("begin");
  try {
    const migration = process.env.DB_TEST_MIGRATION;
    if (migration) await client.query(readFileSync(migration, "utf8"));
    await fn(makeDb(client));
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

function makeDb(client: PoolClient): Db {
  let savepoint = 0;

  const db: Db = {
    async createRider(username) {
      await db.actAsAdmin();
      const { rows } = await client.query<{ id: string }>(
        `insert into auth.users (id, email, raw_user_meta_data)
         values (gen_random_uuid(), $1, jsonb_build_object('username', $2::text, 'display_name', $2::text))
         returning id`,
        [`${username}@test.commutenity.invalid`, username],
      );
      return rows[0].id;
    },

    async actAs(riderId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: riderId,
          role: "authenticated",
          // Supabase access tokens name the project as issuer.
          iss: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
        }),
      ]);
    },

    async actAsAdmin() {
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims', '', true)");
    },

    async run(sql, params) {
      const name = `t${++savepoint}`;
      await client.query(`savepoint ${name}`);
      try {
        const res = await client.query(sql, params);
        await client.query(`release savepoint ${name}`);
        return { ok: true, rowCount: res.rowCount ?? 0, rows: res.rows };
      } catch (err) {
        await client.query(`rollback to savepoint ${name}`);
        const e = err as { code?: string; message: string };
        return { ok: false, code: e.code, message: e.message };
      }
    },

    async rows(sql, params) {
      const res = await client.query(sql, params);
      return res.rows;
    },
  };
  return db;
}
