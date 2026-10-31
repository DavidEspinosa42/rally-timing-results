// Creates the dummy rally (generated data only). Needs db:server running.
// @next/env is bundled CommonJS: Node cannot see its named exports.
import nextEnv from "@next/env";
import { closeDb, getDb } from "@/lib/server/db/client";
import { seedDummyRally } from "@/lib/server/seed";

nextEnv.loadEnvConfig(process.cwd());

try {
  const { created, rallyId, counts } = await seedDummyRally(getDb());
  if (created) {
    console.log(
      `Seeded dummy rally ${rallyId}: ${counts.sections} sections, ` +
        `${counts.stages} stages, ${counts.controls} controls, ` +
        `${counts.classes} classes, ${counts.entries} entries.`,
    );
  } else {
    console.log(`Dummy rally ${rallyId} is already there; nothing to do.`);
  }
} finally {
  await closeDb();
}
