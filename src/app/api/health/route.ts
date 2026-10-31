import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db/client";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  // With Cache Components a GET handler can be prerendered at build time;
  // this keeps the database check at request time.
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json(
      { ok: false, error: "database unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
