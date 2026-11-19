import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/lib/server/db/client";
import { startTestDatabase } from "../../../../test/db";
import { GET } from "./route";

// `connection()` only marks the handler as request-time for Next's
// prerendering, and throws outside a real request. Tests call the handler
// directly, so it does nothing here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

let stopDatabase: (() => Promise<void>) | null = null;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
}, 60_000);

afterAll(async () => {
  await stopDatabase?.();
  await closeDb();
});

describe("GET /api/health", () => {
  it("answers ok while the database is reachable", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers 503 once the database is gone", async () => {
    await stopDatabase?.();
    stopDatabase = null;

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      error: "database unavailable",
    });
  });
});
