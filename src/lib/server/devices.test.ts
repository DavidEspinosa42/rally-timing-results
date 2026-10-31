import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toHex } from "@/lib/record/hash";
import { publicKeyId, signRecord } from "@/lib/record/sign";
import { getDb } from "@/lib/server/db/client";
import {
  deviceGrants,
  devices,
  legs,
  rallies,
  sections,
  stages,
} from "@/lib/server/db/schema";
import {
  type AuthorizeInput,
  authorizeDevice,
  parseTarget,
} from "@/lib/server/devices";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { storeBatch } from "@/lib/server/verify";
import { startTestDatabase } from "../../../test/db";
import { timeRecord } from "../../../test/fixtures";

async function newKey(): Promise<{ keys: CryptoKeyPair; publicKey: string }> {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ]);
  const raw = await crypto.subtle.exportKey("raw", keys.publicKey);
  return { keys, publicKey: toHex(new Uint8Array(raw)) };
}

const finishOnSS1 = (publicKey: string): AuthorizeInput => ({
  publicKey,
  target: { kind: "stage", number: 1 },
  point: "FINISH",
  rallyId: null,
});

async function grantsOf(publicKey: string) {
  const [device] = await getDb()
    .select()
    .from(devices)
    .where(eq(devices.publicKey, publicKey));
  if (device === undefined) return [];
  return getDb()
    .select()
    .from(deviceGrants)
    .where(eq(deviceGrants.deviceKeyId, device.keyId));
}

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
  await seedDummyRally(getDb());
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("parseTarget", () => {
  it.each([
    ["SS3", { kind: "stage", number: 3 }],
    ["ss0", { kind: "stage", number: 0 }],
    ["TC4A", { kind: "control", code: "4A" }],
    ["tc4a", { kind: "control", code: "4A" }],
    ["TC0", { kind: "control", code: "0" }],
  ])("reads %s", (text, target) => {
    expect(parseTarget(text)).toEqual(target);
  });

  it.each(["", "SS", "TC", "PE3", "SS3A", "TC4AB", "4A"])(
    "rejects %j",
    (text) => {
      expect(parseTarget(text)).toBeNull();
    },
  );
});

describe("authorizeDevice", () => {
  it("registers a new key and grants it a point", async () => {
    const { keys, publicKey } = await newKey();
    const result = await authorizeDevice(getDb(), finishOnSS1(publicKey));
    expect(result).toEqual({
      ok: true,
      keyId: await publicKeyId(keys.publicKey),
      rallyId: DUMMY_RALLY_ID,
      grantAdded: true,
    });
    expect(await grantsOf(publicKey)).toMatchObject([{ point: "FINISH" }]);
  });

  it("adds further grants and leaves a repeated one alone", async () => {
    const { publicKey } = await newKey();
    await authorizeDevice(getDb(), finishOnSS1(publicKey));
    const again = await authorizeDevice(getDb(), finishOnSS1(publicKey));
    expect(again).toMatchObject({ ok: true, grantAdded: false });
    const regroup = await authorizeDevice(getDb(), {
      ...finishOnSS1(publicKey),
      target: { kind: "control", code: "2A" },
      point: "TC",
    });
    expect(regroup).toMatchObject({ ok: true, grantAdded: true });
    expect(await grantsOf(publicKey)).toHaveLength(2);
  });

  it.each(["zz", "ab".repeat(31), "ab".repeat(33)])(
    "rejects the public key %j",
    async (publicKey) => {
      const result = await authorizeDevice(getDb(), finishOnSS1(publicKey));
      expect(result).toMatchObject({ ok: false });
    },
  );

  it("rejects a point that does not fit the target", async () => {
    const { publicKey } = await newKey();
    expect(
      await authorizeDevice(getDb(), {
        ...finishOnSS1(publicKey),
        point: "TC",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await authorizeDevice(getDb(), {
        ...finishOnSS1(publicKey),
        target: { kind: "control", code: "2A" },
      }),
    ).toMatchObject({ ok: false });
    expect(await grantsOf(publicKey)).toHaveLength(0);
  });

  it("names the available targets when one is not found", async () => {
    const { publicKey } = await newKey();
    const result = await authorizeDevice(getDb(), {
      ...finishOnSS1(publicKey),
      target: { kind: "stage", number: 9 },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("SS9 is not in this rally");
    expect(!result.ok && result.error).toContain("SS7");
    expect(!result.ok && result.error).toContain("TC4A");
  });

  it("refuses a revoked key", async () => {
    const { keys, publicKey } = await newKey();
    await authorizeDevice(getDb(), finishOnSS1(publicKey));
    await getDb()
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.keyId, await publicKeyId(keys.publicKey)));
    const result = await authorizeDevice(getDb(), {
      ...finishOnSS1(publicKey),
      point: "START",
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("authorizes a device whose records the sync endpoint then accepts", async () => {
    const { keys, publicKey } = await newKey();
    const auth = await authorizeDevice(getDb(), finishOnSS1(publicKey));
    if (!auth.ok) throw new Error(auth.error);
    const [ss1] = await getDb()
      .select({ id: stages.id, sectionId: stages.sectionId })
      .from(stages)
      .where(eq(stages.number, 1));
    if (ss1 === undefined) throw new Error("SS1 not seeded");

    const signed = await signRecord(
      {
        ...timeRecord(),
        recordId: crypto.randomUUID(),
        deviceKeyId: auth.keyId,
        rallyId: DUMMY_RALLY_ID,
        sectionId: ss1.sectionId,
        stageId: ss1.id,
      },
      keys.privateKey,
    );
    expect(await storeBatch(getDb(), [signed])).toMatchObject({
      accepted: 1,
      rejected: null,
    });
  });

  // Last: it adds a second rally, after which --rally becomes required.
  describe("with more than one rally", () => {
    const otherRally = crypto.randomUUID();

    beforeAll(async () => {
      const db = getDb();
      const legId = crypto.randomUUID();
      const sectionId = crypto.randomUUID();
      await db.insert(rallies).values({
        id: otherRally,
        name: "Second Dummy Rally",
        timeZone: "America/Argentina/Buenos_Aires",
      });
      await db
        .insert(legs)
        .values({ id: legId, rallyId: otherRally, number: 1 });
      await db.insert(sections).values({
        id: sectionId,
        legId,
        number: 1,
        date: "2026-12-05",
        firstStartMs: 32_400_000,
      });
      await db.insert(stages).values({
        sectionId,
        position: 1,
        number: 1,
        name: "Stage 1",
        distanceKm: 10,
      });
    });

    it("asks which rally", async () => {
      const { publicKey } = await newKey();
      const result = await authorizeDevice(getDb(), finishOnSS1(publicKey));
      expect(!result.ok && result.error).toContain("pass --rally <id>");
    });

    it("grants within the rally it is given", async () => {
      const { publicKey } = await newKey();
      const result = await authorizeDevice(getDb(), {
        ...finishOnSS1(publicKey),
        rallyId: otherRally,
      });
      expect(result).toMatchObject({ ok: true, rallyId: otherRally });
      const [grant] = await grantsOf(publicKey);
      const [stage] = await getDb()
        .select({ id: stages.id })
        .from(stages)
        .innerJoin(sections, eq(stages.sectionId, sections.id))
        .innerJoin(legs, eq(sections.legId, legs.id))
        .where(and(eq(legs.rallyId, otherRally), eq(stages.number, 1)));
      expect(grant?.stageId).toBe(stage?.id);
    });

    it("refuses a key already authorized for another rally", async () => {
      const { publicKey } = await newKey();
      await authorizeDevice(getDb(), {
        ...finishOnSS1(publicKey),
        rallyId: DUMMY_RALLY_ID,
      });
      const result = await authorizeDevice(getDb(), {
        ...finishOnSS1(publicKey),
        rallyId: otherRally,
      });
      expect(!result.ok && result.error).toContain("another rally");
    });
  });
});
