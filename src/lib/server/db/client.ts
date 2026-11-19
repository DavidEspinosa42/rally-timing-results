import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Every connection is multiplexed onto one PGlite backend by db:server, whose
// maxConnections (scripts/db-server.mts) must stay above this pool size so
// scripts can still connect while the app is running.
const POOL_MAX = 4;

type Connection = { pool: Pool; db: NodePgDatabase };

// Kept on globalThis so dev reloads reuse the pool instead of opening a new
// one on every change.
const store = globalThis as typeof globalThis & {
  rallyTimingResultsDb?: Connection | undefined;
};

/** The app's database, created on first use from DATABASE_URL. */
export function getDb(): NodePgDatabase {
  if (store.rallyTimingResultsDb === undefined) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set; copy .env.example to .env.local",
      );
    }
    const pool = new Pool({ connectionString, max: POOL_MAX });
    // An idle connection drops when db:server restarts; the pool reconnects
    // on the next query, so log instead of crashing the process.
    pool.on("error", (error) => {
      console.error("database connection lost:", error.message);
    });
    // No schema is passed: Relational Queries (db.query) stay unavailable.
    store.rallyTimingResultsDb = { pool, db: drizzle({ client: pool }) };
  }
  return store.rallyTimingResultsDb.db;
}

/** Closes the pool, so a script can exit. */
export async function closeDb(): Promise<void> {
  const connection = store.rallyTimingResultsDb;
  store.rallyTimingResultsDb = undefined;
  await connection?.pool.end();
}
