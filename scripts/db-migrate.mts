// Applies pending migrations from ./drizzle through DATABASE_URL, so
// db:server must be running.
// @next/env is bundled CommonJS: Node cannot see its named exports.
import nextEnv from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "@/lib/server/db/client";

nextEnv.loadEnvConfig(process.cwd());

try {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await closeDb();
}
