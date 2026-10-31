import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import {
  MAX_BODY_BYTES,
  storeBatch,
  syncRequestSchema,
} from "@/lib/server/verify";

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string, details?: unknown) {
  return Response.json(
    details === undefined ? { error: message } : { error: message, details },
    { status, headers: NO_STORE },
  );
}

// Plain REST, not a Server Action: devices call it from their outbox.
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return error(413, "batch too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return error(413, "batch too large");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, "body is not JSON");
  }
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid batch", z.flattenError(parsed.error));
  }

  const result = await storeBatch(getDb(), parsed.data.records);
  return Response.json(result, { headers: NO_STORE });
}
