import { defineConfig } from "drizzle-kit";

// drizzle-kit only generates migrations here; `pnpm db:migrate` applies them.
// There are no credentials on purpose, so `drizzle-kit push` cannot bypass
// the migration files.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
});
