import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { describeDevice } from "@/lib/server/lookup";

const NO_STORE = { "Cache-Control": "no-store" };
const keyIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function GET(
  _request: Request,
  context: RouteContext<"/api/devices/[keyId]">,
): Promise<Response> {
  await connection();
  const parsed = keyIdSchema.safeParse((await context.params).keyId);
  if (!parsed.success) {
    return Response.json(
      { error: "keyId must be 64 lowercase hex characters" },
      { status: 400, headers: NO_STORE },
    );
  }

  const device = await describeDevice(getDb(), parsed.data);
  if (device === null) {
    // Expected while the organizer has not authorized this key yet.
    return Response.json(
      { error: "device not authorized" },
      { status: 404, headers: NO_STORE },
    );
  }
  return Response.json(device, { headers: NO_STORE });
}
