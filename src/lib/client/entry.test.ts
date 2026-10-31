import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalDb } from "@/lib/client/db";
import { getOrCreateDeviceKey } from "@/lib/client/device-key";
import {
  type EntryFields,
  enterRecord,
  latestEntries,
} from "@/lib/client/entry";
import { parseCanonical } from "@/lib/record/canonical";
import { verifyChain } from "@/lib/record/chain";
import { verifyRecord } from "@/lib/record/sign";
import { recordV1Schema } from "@/lib/record/types";
import { IDS } from "../../../test/fixtures";
import { newBrowserProfile, openLocalDb } from "../../../test/local-db";

const OTHER_RALLY = "00000000-0000-4000-8000-000000000099";

type TimeFields = Extract<EntryFields, { kind: "TIME" }>;

/** A FINISH on the fixture stage, to the tenth. */
function finish(carNumber: number, timeOfDayMs = 54_372_400): TimeFields {
  return {
    sectionId: IDS.section,
    stageId: IDS.stage,
    controlId: null,
    kind: "TIME",
    point: "FINISH",
    carNumber,
    timeOfDayMs,
    elapsedMs: null,
    precision: "DS",
    source: "PHOTOCELL_PRINTER",
    sourceRole: "PRIMARY",
    refRecordId: null,
    penaltyMs: null,
    status: null,
    reason: null,
  };
}

const opened: LocalDb[] = [];
function open(profile = newBrowserProfile()): LocalDb {
  const db = openLocalDb(profile);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.restoreAllMocks();
});

/** The device's whole chain, as stored, in seq order. */
async function storedChain(db: LocalDb, keyId: string) {
  const rows = await db.records.where({ keyId }).sortBy("seq");
  return rows.map((row) => ({
    record: recordV1Schema.parse(parseCanonical(row.payload)),
    hash: row.hash,
  }));
}

describe("enterRecord", () => {
  it("starts the chain, fills in identity and audit time, and signs", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    const { record, stored } = await enterRecord(
      db,
      key,
      finish(8),
      () => 1_790_000_000_000,
    );

    expect(record).toMatchObject({
      schema: "rally-timing/record/v1",
      deviceKeyId: key.keyId,
      rallyId: IDS.rally,
      seq: 0,
      prevHash: null,
      enteredAtMs: 1_790_000_000_000,
      carNumber: 8,
    });
    expect(await db.records.get(record.recordId)).toEqual(stored);
    expect(await verifyRecord(stored, key.publicKey)).toEqual({
      ok: true,
      record,
      hash: stored.hash,
    });
  });

  it("links each entry to the one before it", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    const entries = [];
    for (let car = 1; car <= 5; car++) {
      entries.push(await enterRecord(db, key, finish(car)));
    }
    const last = entries.at(-1);
    expect(verifyChain(await storedChain(db, key.keyId))).toEqual({
      ok: true,
      head: { seq: 4, hash: last?.stored.hash },
    });
  });

  it("gives entries made at the same moment distinct, linked positions", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    const entries = await Promise.all(
      Array.from({ length: 10 }, (_, i) => enterRecord(db, key, finish(i + 1))),
    );
    expect(
      entries.map(({ record }) => record.seq).sort((a, b) => a - b),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(verifyChain(await storedChain(db, key.keyId)).ok).toBe(true);
  });

  it("saves nothing and uses no seq when the entry is invalid", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    await expect(enterRecord(db, key, finish(0))).rejects.toThrow();
    await expect(
      enterRecord(db, key, { ...finish(8), precision: "MIN" }),
    ).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
    const { record } = await enterRecord(db, key, finish(8));
    expect(record.seq).toBe(0);
  });

  it("continues the chain after the app is reopened", async () => {
    const profile = newBrowserProfile();
    const before = open(profile);
    const key = await getOrCreateDeviceKey(before, IDS.rally);
    await enterRecord(before, key, finish(1));
    const second = await enterRecord(before, key, finish(2));
    before.close();

    const after = open(profile);
    const { record } = await enterRecord(after, key, finish(3));
    expect(record).toMatchObject({ seq: 2, prevHash: second.stored.hash });
  });

  it("keeps a separate chain for each rally's key", async () => {
    const db = open();
    const a = await getOrCreateDeviceKey(db, IDS.rally);
    const b = await getOrCreateDeviceKey(db, OTHER_RALLY);
    await enterRecord(db, a, finish(1));
    const { record } = await enterRecord(db, b, finish(1));
    expect(record).toMatchObject({ seq: 0, rallyId: OTHER_RALLY });
  });

  it("records a penalty at a time control", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    const { record } = await enterRecord(db, key, {
      ...finish(8),
      stageId: null,
      controlId: IDS.control,
      kind: "PENALTY",
      point: null,
      timeOfDayMs: null,
      elapsedMs: null,
      precision: null,
      source: null,
      sourceRole: null,
      penaltyMs: 10_000,
      reason: "TC_LATE",
    });
    expect(record).toMatchObject({ kind: "PENALTY", penaltyMs: 10_000 });
  });

  it("never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    await enterRecord(db, key, finish(8));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("latestEntries", () => {
  it("returns the newest entries first, read from their signed payload", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    for (let car = 1; car <= 4; car++) {
      await enterRecord(db, key, finish(car));
    }
    const latest = await latestEntries(db, key, 3);
    expect(latest.map(({ record }) => record.carNumber)).toEqual([4, 3, 2]);
    expect(latest.map(({ record }) => record.seq)).toEqual([3, 2, 1]);
  });

  it("only returns this key's entries", async () => {
    const db = open();
    const a = await getOrCreateDeviceKey(db, IDS.rally);
    const b = await getOrCreateDeviceKey(db, OTHER_RALLY);
    await enterRecord(db, a, finish(1));
    await enterRecord(db, b, finish(2));
    expect(
      (await latestEntries(db, b)).map(({ record }) => record.carNumber),
    ).toEqual([2]);
  });
});
