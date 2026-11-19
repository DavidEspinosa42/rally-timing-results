// Deletes the local database, so the next db:server starts empty. Refuses
// while db:server is running: deleting the files under an open database
// would corrupt it.
import { rm } from "node:fs/promises";
import { DATA_DIR, isPortFree, portFromEnv } from "./lib/local-db.mjs";

const port = portFromEnv();
if (!(await isPortFree(port))) {
  console.error(
    `Port ${port} is in use: stop db:server first. ${DATA_DIR} was not deleted.`,
  );
  process.exit(1);
}

await rm(DATA_DIR, { recursive: true, force: true });
console.log(
  `Deleted ${DATA_DIR}. Start npm run db:server, then run npm run db:migrate and npm run db:seed.`,
);
