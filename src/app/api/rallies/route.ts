import { connection } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { listRallies } from "@/lib/server/lookup";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  // Keeps the query at request time instead of in the prerendered build.
  await connection();
  return Response.json(await listRallies(getDb()), { headers: NO_STORE });
}
