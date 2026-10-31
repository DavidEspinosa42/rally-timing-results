import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deviceInfoSchema, ralliesResponseSchema } from "@/lib/api/contract";
import { toHex } from "@/lib/record/hash";
import { publicKeyId } from "@/lib/record/sign";
import type { Point } from "@/lib/record/types";
import { getDb } from "@/lib/server/db/client";
import { devices } from "@/lib/server/db/schema";
import { authorizeDevice, parseTarget } from "@/lib/server/devices";
import { describeDevice, listRallies } from "@/lib/server/lookup";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { startTestDatabase } from "../../../test/db";

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

async function authorize(publicKey: string, grants: [string, Point][]) {
  for (const [text, point] of grants) {
    const target = parseTarget(text);
    if (target === null) throw new Error(`bad target ${text}`);
    const result = await authorizeDevice(getDb(), {
      publicKey,
      target,
      point,
      rallyId: null,
    });
    if (!result.ok) throw new Error(result.error);
  }
}

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
  await seedDummyRally(getDb());
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("listRallies", () => {
  it("lists the seeded rally in the response shape", async () => {
    const rallies = await listRallies(getDb());
    expect(rallies).toEqual([
      { id: DUMMY_RALLY_ID, name: "Dummy Regional Rally" },
    ]);
    expect(ralliesResponseSchema.parse(rallies)).toEqual(rallies);
  });
});

describe("describeDevice", () => {
  it("does not know a key that was never authorized", async () => {
    const { keyId } = await newKey();
    expect(await describeDevice(getDb(), keyId)).toBeNull();
  });

  it("lists the grants in itinerary order, whatever order they were given in", async () => {
    const { publicKey, keyId } = await newKey();
    await authorize(publicKey, [
      ["SS3", "FINISH"],
      ["TC2A", "TC"],
      ["SS1", "FINISH"],
      ["TC1", "TC"],
      ["SS0", "START"],
      ["SS1", "START"],
    ]);
    const device = await describeDevice(getDb(), keyId);
    expect(device).toMatchObject({
      keyId,
      rallyId: DUMMY_RALLY_ID,
      revoked: false,
    });
    const labels = device?.grants.map(({ target, point }) =>
      target.kind === "stage"
        ? `SS${target.number} ${point}`
        : `TC${target.code} ${point}`,
    );
    expect(labels).toEqual([
      "SS0 START",
      "TC1 TC",
      "SS1 FINISH",
      "SS1 START",
      "TC2A TC",
      "SS3 FINISH",
    ]);
  });

  it("describes each target in the response shape", async () => {
    const { publicKey, keyId } = await newKey();
    await authorize(publicKey, [
      ["SS0", "FINISH"],
      ["SS7", "FINISH"],
      ["TC2D", "TC"],
    ]);
    const device = deviceInfoSchema.parse(await describeDevice(getDb(), keyId));
    expect(device.grants.map(({ target }) => target)).toMatchObject([
      { kind: "stage", number: 0, name: "Shakedown", scoring: false },
      { kind: "control", code: "2D", controlKind: "SERVICE_OUT" },
      { kind: "stage", number: 7, isPowerStage: true, scoring: true },
    ]);
  });

  it("still describes a revoked device, marked as revoked", async () => {
    const { publicKey, keyId } = await newKey();
    await authorize(publicKey, [["SS1", "FINISH"]]);
    await getDb()
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.keyId, keyId));
    expect(await describeDevice(getDb(), keyId)).toMatchObject({
      revoked: true,
      grants: [{ point: "FINISH" }],
    });
  });
});
