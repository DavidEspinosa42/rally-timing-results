// The local PGlite's data directory and address, shared by db:server and
// db:reset.
import { createServer } from "node:net";
// @next/env is bundled CommonJS: Node cannot see its named exports.
import nextEnv from "@next/env";

export const DATA_DIR = "./.data/pglite";
// The socket server has no SSL, so it only listens on loopback.
export const HOST = "127.0.0.1";

nextEnv.loadEnvConfig(process.cwd());

export function portFromEnv(): number {
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

// A taken port means db:server is running and has the directory open.
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, HOST, () => probe.close(() => resolve(true)));
  });
}
