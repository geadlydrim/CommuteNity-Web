/**
 * Database seam: run statements as a signed-in rider inside a transaction that
 * is always rolled back, so tests leave no data behind in the linked project.
 *
 * Set DB_TEST_MIGRATION=<path to .sql> to apply an unpushed migration inside
 * each test's transaction first (useful when no local database is available).
 *
 * Races only show when transactions commit, so `withCommittedFixtures` runs
 * concurrent sessions on their own connections and commits for real. It always
 * deletes the riders it created (and everything they own) afterwards. It runs
 * against the live schema only: DB_TEST_MIGRATION does not apply to it.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { Client, Pool, type ClientBase, type PoolClient } from "pg";

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
      return insertRider(client, username);
    },

    actAs: (riderId) => setRider(client, riderId),

    actAsAdmin: () => setAdmin(client),

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

async function insertRider(client: ClientBase, username: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, jsonb_build_object('username', $2::text, 'display_name', $2::text))
     returning id`,
    [`${username}@test.commutenity.invalid`, username],
  );
  return rows[0].id;
}

/** Transaction-local: the caller must be inside `begin`. */
async function setRider(client: ClientBase, riderId: string): Promise<void> {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({
      sub: riderId,
      role: "authenticated",
      // Supabase access tokens name the project as issuer.
      iss: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
    }),
  ]);
}

async function setAdmin(client: ClientBase): Promise<void> {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '', true)");
}

/** One rider's (or the admin's) own connection, separate from every other session. */
export interface Session {
  /** Backend process id, to see what this session is waiting on. */
  readonly pid: number;
  /** Run following statements as this rider. Needs an open transaction (`begin`). */
  actAs(riderId: string): Promise<void>;
  /** Run following statements as the migration role. Needs an open transaction. */
  actAsAdmin(): Promise<void>;
  /** Run one statement that must succeed and return its rows. */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface CommittedFixtures {
  /**
   * Create and commit a rider (auth user + profile via handle_new_user). A random
   * suffix keeps the username unique, so keep `prefix` to 13 characters or fewer.
   */
  createRider(prefix: string): Promise<string>;
  /** Open a new session on its own connection. Statements autocommit unless wrapped in `begin`/`commit`. */
  session(): Promise<Session>;
  /** Run one autocommitted statement as the migration role on the fixtures' own connection. */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Resolve once `session` is waiting on a lock another transaction holds; fail after `timeoutMs`. */
  waitUntilBlocked(session: Session, timeoutMs?: number): Promise<void>;
}

/**
 * Server-side limits for committed sessions, so a stuck lock fails the test
 * quickly instead of hanging it, and an abandoned transaction can't linger.
 */
const SESSION_LIMITS = [
  "set statement_timeout = '15s'",
  "set lock_timeout = '10s'",
  "set idle_in_transaction_session_timeout = '30s'",
];

async function connect(): Promise<{ client: Client; pid: number }> {
  const client = new Client({ connectionString });
  // A terminated backend surfaces as an 'error' event; unhandled, it would crash the run.
  client.on("error", () => {});
  await client.connect();
  try {
    for (const sql of SESSION_LIMITS) await client.query(sql);
    const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    return { client, pid: rows[0].pid };
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
}

export async function withCommittedFixtures(fn: (fx: CommittedFixtures) => Promise<void>): Promise<void> {
  const { client: admin } = await connect();
  const riders: string[] = [];
  const sessions: { client: Client; pid: number }[] = [];

  const fixtures: CommittedFixtures = {
    async createRider(prefix) {
      const id = await insertRider(admin, `${prefix}_${randomBytes(3).toString("hex")}`);
      riders.push(id);
      return id;
    },

    async session() {
      const { client, pid } = await connect();
      sessions.push({ client, pid });
      return {
        pid,
        actAs: (riderId) => setRider(client, riderId),
        actAsAdmin: () => setAdmin(client),
        async rows(sql, params) {
          const res = await client.query(sql, params);
          return res.rows;
        },
      };
    },

    async rows(sql, params) {
      const res = await admin.query(sql, params);
      return res.rows;
    },

    async waitUntilBlocked(session, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await admin.query<{ blocked: boolean }>(
          "select cardinality(pg_blocking_pids($1)) > 0 as blocked",
          [session.pid],
        );
        if (rows[0].blocked) return;
        if (Date.now() > deadline) throw new Error(`session ${session.pid} never waited on a lock`);
        await sleep(25);
      }
    },
  };

  let failed = false;
  try {
    await fn(fixtures);
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    // Kill sessions first so their open transactions roll back and release
    // the locks the cleanup delete needs.
    for (const { client, pid } of sessions) {
      await admin.query("select pg_terminate_backend($1)", [pid]).catch(() => {});
      await client.end().catch(() => {});
    }
    try {
      // Cascades to public.users, then their posts and votes.
      if (riders.length > 0) await admin.query("delete from auth.users where id = any($1::uuid[])", [riders]);
    } catch (err) {
      // Don't hide the test's own failure behind a cleanup failure.
      if (!failed) throw err;
      console.error("withCommittedFixtures cleanup failed; leftover riders:", riders, err);
    } finally {
      await admin.end().catch(() => {});
    }
  }
}
