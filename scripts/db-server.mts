// Serves the local PGlite database over the Postgres protocol. This is the
// only process that opens .data/pglite: Next, the scripts and drizzle-kit
// all connect through DATABASE_URL.
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
// @next/env is bundled CommonJS: Node cannot see its named exports.
import nextEnv from "@next/env";

const DATA_DIR = "./.data/pglite";
// The socket server has no SSL, so it only listens on loopback.
const HOST = "127.0.0.1";
// Above the app's pool size (src/lib/server/db/client.ts), leaving room for
// a script to connect while the app runs.
const MAX_CONNECTIONS = 8;

nextEnv.loadEnvConfig(process.cwd());

function portFromEnv(): number {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set; copy .env.example to .env.local");
  }
  const { hostname, port } = new URL(url);
  if (hostname !== HOST && hostname !== "localhost") {
    throw new Error(`DATABASE_URL must point at ${HOST}, not ${hostname}`);
  }
  if (port === "") throw new Error("DATABASE_URL must include a port");
  return Number(port);
}

// Checked before PGlite opens the directory: a second server must exit
// without touching the data of the one already running.
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, HOST, () => probe.close(() => resolve(true)));
  });
}

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
