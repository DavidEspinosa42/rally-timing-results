import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ralliesResponseSchema } from "@/lib/api/contract";
import { getDb } from "@/lib/server/db/client";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { startTestDatabase } from "../../../../test/db";
import { GET } from "./route";

// `connection()` only marks the handler as request-time for Next's
// prerendering, and throws outside a real request. Tests call the handler
// directly, so it does nothing here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("GET /api/rallies", () => {
  it("answers an empty list before any rally exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("lists the seeded rally in the response shape, never cached", async () => {
    await seedDummyRally(getDb());

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ralliesResponseSchema.parse(await response.json())).toEqual([
      { id: DUMMY_RALLY_ID, name: "Dummy Regional Rally" },
    ]);
  });
});
