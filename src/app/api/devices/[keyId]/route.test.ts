import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deviceInfoSchema } from "@/lib/api/contract";
import { toHex } from "@/lib/record/hash";
import { publicKeyId } from "@/lib/record/sign";
import { getDb } from "@/lib/server/db/client";
import { authorizeDevice } from "@/lib/server/devices";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { startTestDatabase } from "../../../../../test/db";
import { GET } from "./route";

// `connection()` only marks the handler as request-time for Next's
// prerendering, and throws outside a real request. Tests call the handler
// directly, so it does nothing here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const get = (keyId: string) =>
  GET(new Request(`http://localhost/api/devices/${keyId}`), {
    params: Promise.resolve({ keyId }),
  });

async function newKey(): Promise<{ publicKey: string; keyId: string }> {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ]);
  const raw = await crypto.subtle.exportKey("raw", keys.publicKey);
  return {
    publicKey: toHex(new Uint8Array(raw)),
    keyId: await publicKeyId(keys.publicKey),
  };
}

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
  await seedDummyRally(getDb());
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("GET /api/devices/[keyId]", () => {
  it.each([
    ["too short", "ab12"],
    ["uppercase", "AB".repeat(32)],
    ["not hex", "zz".repeat(32)],
  ])("answers 400 for a key id that is %s", async (_, keyId) => {
    const response = await get(keyId);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "keyId must be 64 lowercase hex characters",
    });
  });

  it("answers 404 until the organizer authorizes the key", async () => {
    const { keyId } = await newKey();
    const response = await get(keyId);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "device not authorized" });
  });

  it("describes an authorized device in the response shape", async () => {
    const { publicKey, keyId } = await newKey();
    const result = await authorizeDevice(getDb(), {
      publicKey,
      target: { kind: "stage", number: 1 },
      point: "FINISH",
      rallyId: null,
    });
    expect(result.ok).toBe(true);

    const response = await get(keyId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const device = deviceInfoSchema.parse(await response.json());
    expect(device).toMatchObject({
      keyId,
      rallyId: DUMMY_RALLY_ID,
      revoked: false,
    });
    expect(device.grants).toHaveLength(1);
    expect(device.grants[0]).toMatchObject({
      point: "FINISH",
      target: { kind: "stage", number: 1 },
    });
  });
});
