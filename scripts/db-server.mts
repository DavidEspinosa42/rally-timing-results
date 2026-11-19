// Serves the local PGlite database over the Postgres protocol. This is the
// only process that opens .data/pglite: Next, the scripts and drizzle-kit
// all connect through DATABASE_URL.
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { DATA_DIR, HOST, isPortFree, portFromEnv } from "./lib/local-db.mjs";

// Above the app's pool size (src/lib/server/db/client.ts), leaving room for
// a script to connect while the app runs.
const MAX_CONNECTIONS = 8;

// The port is checked before PGlite opens the directory: a second server
// must exit without touching the data of the one already running.
const port = portFromEnv();
if (!(await isPortFree(port))) {
  console.error(
    `Port ${port} is in use (is db:server already running?). ${DATA_DIR} was not opened.`,
  );
  process.exit(1);
}

// PGlite creates its own directory, but not missing parents.
await mkdir(dirname(DATA_DIR), { recursive: true });
const db = await PGlite.create(DATA_DIR);
const server = new PGLiteSocketServer({
  db,
  host: HOST,
  port,
  maxConnections: MAX_CONNECTIONS,
});
await server.start();
console.log(`PGlite ${DATA_DIR} listening on ${HOST}:${port}`);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: closing the database`);
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
