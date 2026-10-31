import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/sync/route";
import { MAX_BATCH_RECORDS, syncResultSchema } from "@/lib/api/contract";
import { type ChainHead, nextPosition } from "@/lib/record/chain";
import { toHex } from "@/lib/record/hash";
import {
  publicKeyId,
  type SignedRecord,
  signRecord,
  verifyRecord,
} from "@/lib/record/sign";
import type { Point, TimeRecord } from "@/lib/record/types";
import { getDb } from "@/lib/server/db/client";
import {
  controls,
  deviceGrants,
  devices,
  legs,
  rallies,
  records,
  sections,
  stages,
} from "@/lib/server/db/schema";
import { storeBatch } from "@/lib/server/verify";
import { startTestDatabase } from "../../../test/db";
import { IDS, timeRecord } from "../../../test/fixtures";

type Grant = { stageId: string | null; controlId: string | null; point: Point };
const FINISH: Grant = { stageId: IDS.stage, controlId: null, point: "FINISH" };
const TC: Grant = { stageId: null, controlId: IDS.control, point: "TC" };

/** A TC at 15:39 on the seeded time control. */
const atControl: Partial<TimeRecord> = {
  stageId: null,
  controlId: IDS.control,
  point: "TC",
  timeOfDayMs: 56_340_000,
  precision: "MIN",
};

/** A phone with its own key, appending to its own chain. */
class TestDevice {
  head: ChainHead = null;

  private constructor(
    readonly keys: CryptoKeyPair,
    readonly keyId: string,
  ) {}

  static async create(grants: Grant[] = [FINISH]): Promise<TestDevice> {
    const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
      "sign",
      "verify",
    ]);
    const raw = await crypto.subtle.exportKey("raw", keys.publicKey);
    const keyId = await publicKeyId(keys.publicKey);
    const device = new TestDevice(keys, keyId);
    await device.register(toHex(new Uint8Array(raw)), grants);
    return device;
  }

  /** Like create, but the server never hears of this device. */
  static async unknown(): Promise<TestDevice> {
    const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
      "sign",
      "verify",
    ]);
    return new TestDevice(keys, await publicKeyId(keys.publicKey));
  }

  private async register(publicKey: string, grants: Grant[]): Promise<void> {
    const db = getDb();
    await db
      .insert(devices)
      .values({ keyId: this.keyId, publicKey, rallyId: IDS.rally });
    if (grants.length > 0) {
      await db
        .insert(deviceGrants)
        .values(grants.map((grant) => ({ ...grant, deviceKeyId: this.keyId })));
    }
  }

  /** Signs the next record of the chain. */
  async sign(change: Partial<TimeRecord> = {}): Promise<SignedRecord> {
    const record: TimeRecord = {
      ...timeRecord(),
      ...nextPosition(this.head),
      recordId: crypto.randomUUID(),
      deviceKeyId: this.keyId,
      ...change,
    };
    const signed = await signRecord(record, this.keys.privateKey);
    this.head = { seq: record.seq, hash: signed.hash };
    return signed;
  }

  async signMany(length: number): Promise<SignedRecord[]> {
    const batch: SignedRecord[] = [];
    for (let i = 0; i < length; i++) batch.push(await this.sign());
    return batch;
  }

  async storedCount(): Promise<number> {
    const [row] = await getDb()
      .select({ n: count() })
      .from(records)
      .where(eq(records.deviceKeyId, this.keyId));
    return row?.n ?? 0;
  }
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

const recordIdOf = (signed: SignedRecord): string =>
  JSON.parse(signed.payload).recordId;

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
  const db = getDb();
  const legId = crypto.randomUUID();
  await db.insert(rallies).values({
    id: IDS.rally,
    name: "Dummy Rally",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  await db.insert(legs).values({ id: legId, rallyId: IDS.rally, number: 1 });
  await db.insert(sections).values({
    id: IDS.section,
    legId,
    number: 1,
    date: "2026-11-14",
    firstStartMs: 9 * 3_600_000,
  });
  await db.insert(controls).values({
    id: IDS.control,
    sectionId: IDS.section,
    position: 1,
    code: "1",
    allottedMin: 30,
  });
  await db.insert(stages).values({
    id: IDS.stage,
    sectionId: IDS.section,
    position: 2,
    number: 1,
    name: "Stage A",
    distanceKm: 12.5,
  });
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("storeBatch", () => {
  it("stores a valid batch and returns the new head", async () => {
    const device = await TestDevice.create();
    const batch = await device.signMany(3);
    expect(await storeBatch(getDb(), batch)).toEqual({
      accepted: 3,
      head: { seq: 2, hash: at(batch, 2).hash },
      rejected: null,
    });
    expect(await device.storedCount()).toBe(3);
  });

  it("ignores a batch it already stored", async () => {
    const device = await TestDevice.create();
    const batch = await device.signMany(3);
    await storeBatch(getDb(), batch);
    const again = await storeBatch(getDb(), batch);
    expect(again).toMatchObject({ accepted: 3, rejected: null });
    expect(await device.storedCount()).toBe(3);
  });

  it("accepts a resend that overlaps what is stored", async () => {
    const device = await TestDevice.create();
    const stored = await device.signMany(3);
    await storeBatch(getDb(), stored);
    const next = await device.sign();
    const resend = [at(stored, 1), at(stored, 2), next];
    expect(await storeBatch(getDb(), resend)).toEqual({
      accepted: 3,
      head: { seq: 3, hash: next.hash },
      rejected: null,
    });
    expect(await device.storedCount()).toBe(4);
  });

  it("stops at a gap in the chain and keeps what came before it", async () => {
    const device = await TestDevice.create();
    const batch = await device.signMany(3);
    const result = await storeBatch(getDb(), [at(batch, 0), at(batch, 2)]);
    expect(result).toEqual({
      accepted: 1,
      head: { seq: 0, hash: at(batch, 0).hash },
      rejected: { index: 1, recordId: recordIdOf(at(batch, 2)), reason: "gap" },
    });
    expect(await device.storedCount()).toBe(1);
  });

  it("rejects a record that does not continue the stored chain", async () => {
    const device = await TestDevice.create();
    await storeBatch(getDb(), await device.signMany(1));
    device.head = { seq: 0, hash: "00".repeat(32) };
    const result = await storeBatch(getDb(), [await device.sign()]);
    expect(result.rejected).toMatchObject({ index: 0, reason: "broken-link" });
    expect(await device.storedCount()).toBe(1);
  });

  it("rejects a point the device holds no grant for", async () => {
    const device = await TestDevice.create([FINISH]);
    const result = await storeBatch(getDb(), [
      await device.sign({ point: "START" }),
    ]);
    expect(result).toMatchObject({
      accepted: 0,
      rejected: { index: 0, reason: "not-authorized" },
    });
    expect(await device.storedCount()).toBe(0);
  });

  it("rejects a control the device holds no grant for", async () => {
    const device = await TestDevice.create([FINISH]);
    const result = await storeBatch(getDb(), [await device.sign(atControl)]);
    expect(result.rejected).toMatchObject({ reason: "not-authorized" });
  });

  it("lets one device enter several targets and points", async () => {
    // A regroup device that also enters the FINISH of the previous stage.
    const device = await TestDevice.create([TC, FINISH]);
    const batch = [await device.sign(atControl), await device.sign()];
    expect(await storeBatch(getDb(), batch)).toMatchObject({
      accepted: 2,
      rejected: null,
    });
  });

  it("rejects every record from a revoked device", async () => {
    const device = await TestDevice.create();
    await storeBatch(getDb(), await device.signMany(1));
    await getDb()
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.keyId, device.keyId));
    const result = await storeBatch(getDb(), [await device.sign()]);
    expect(result).toMatchObject({
      accepted: 0,
      head: { seq: 0 },
      rejected: { index: 0, reason: "revoked" },
    });
    expect(await device.storedCount()).toBe(1);
  });

  it("rejects a device that was never authorized", async () => {
    const device = await TestDevice.unknown();
    const result = await storeBatch(getDb(), [await device.sign()]);
    expect(result).toMatchObject({
      accepted: 0,
      head: null,
      rejected: { index: 0, reason: "unknown-device" },
    });
  });

  it("rejects a record altered after signing", async () => {
    const device = await TestDevice.create();
    const signed = await device.sign();
    const payload = signed.payload.replace('"carNumber":8', '"carNumber":9');
    expect(payload).not.toBe(signed.payload);
    const result = await storeBatch(getDb(), [{ ...signed, payload }]);
    expect(result.rejected).toMatchObject({ reason: "bad-signature" });
    expect(await device.storedCount()).toBe(0);
  });

  it("rejects a record for another rally", async () => {
    const device = await TestDevice.create();
    const result = await storeBatch(getDb(), [
      await device.sign({ rallyId: crypto.randomUUID() }),
    ]);
    expect(result.rejected).toMatchObject({ reason: "wrong-rally" });
  });

  it("rejects a stored record id that comes back with other content", async () => {
    const device = await TestDevice.create();
    const original = await device.sign();
    await storeBatch(getDb(), [original]);
    device.head = null;
    const rewritten = await device.sign({
      recordId: recordIdOf(original),
      carNumber: 9,
    });
    const result = await storeBatch(getDb(), [rewritten]);
    expect(result.rejected).toMatchObject({ reason: "conflict" });
  });

  it("keeps the signed payload, which still verifies after the round trip", async () => {
    const device = await TestDevice.create();
    const signed = await device.sign();
    await storeBatch(getDb(), [signed]);
    const [row] = await getDb()
      .select({
        payload: records.payload,
        hash: records.hash,
        signature: records.signature,
        enteredAtMs: records.enteredAtMs,
        carNumber: records.carNumber,
      })
      .from(records)
      .where(eq(records.deviceKeyId, device.keyId));
    if (row === undefined) throw new Error("record not stored");

    expect(row.payload).toBe(signed.payload);
    const verified = await verifyRecord(row, device.keys.publicKey);
    expect(verified.ok).toBe(true);
    expect(verified.ok && verified.record).toMatchObject({
      carNumber: row.carNumber,
      enteredAtMs: row.enteredAtMs,
    });
  });

  // Why verification reads `payload` (docs/adr/0005): the driver itself does
  // not round-trip bigint columns as numbers.
  it("gets bigint columns back from pg as strings", async () => {
    const device = await TestDevice.create();
    await storeBatch(getDb(), await device.signMany(1));
    const result = await getDb().execute(
      sql`select entered_at_ms from records where device_key_id = ${device.keyId}`,
    );
    expect(typeof result.rows[0]?.entered_at_ms).toBe("string");
  });
});

describe("POST /api/sync", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
    );

  it("stores a valid batch", async () => {
    const device = await TestDevice.create();
    const response = await post(
      JSON.stringify({ records: await device.signMany(2) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(syncResultSchema.parse(await response.json())).toMatchObject({
      accepted: 2,
      rejected: null,
    });
  });

  it(`rejects a batch of more than ${MAX_BATCH_RECORDS} records`, async () => {
    const device = await TestDevice.create();
    const signed = await device.sign();
    const records = Array.from({ length: MAX_BATCH_RECORDS + 1 }, () => signed);
    const response = await post(JSON.stringify({ records }));
    expect(response.status).toBe(400);
    expect(await device.storedCount()).toBe(0);
  });

  it("rejects a body larger than the limit before reading it", async () => {
    const response = await post("{}", { "content-length": "99999999" });
    expect(response.status).toBe(413);
  });

  it.each([
    ["not JSON", "{"],
    ["an empty batch", JSON.stringify({ records: [] })],
    ["an unknown field", JSON.stringify({ records: [], deviceName: "x" })],
    [
      "a malformed record",
      JSON.stringify({
        records: [{ payload: "{}", hash: "x", signature: "y" }],
      }),
    ],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });
});
