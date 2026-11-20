import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "@/lib/server/db/client";

/**
 * Starts an in-memory PGlite behind a socket server on a free port, points
 * DATABASE_URL at it and applies the migrations, so tests talk to Postgres
 * through the same `pg` client as the app. It never opens .data/pglite.
 */
export async function startTestDatabase(): Promise<() => Promise<void>> {
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 8,
  });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres@${server.getServerConn()}/postgres`;
  await migrate(getDb(), { migrationsFolder: "./drizzle" });

  return async () => {
    await closeDb();
    await server.stop();
    await pglite.close();
  };
}
