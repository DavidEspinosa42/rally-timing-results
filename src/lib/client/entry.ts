import "client-only";
import { Dexie } from "dexie";
import { parseCanonical } from "@/lib/record/canonical";
import { type ChainHead, nextPosition } from "@/lib/record/chain";
import { signRecord } from "@/lib/record/sign";
import {
  RECORD_SCHEMA_V1,
  type RecordV1,
  recordV1Schema,
} from "@/lib/record/types";
import { type LocalDb, type StoredRecord, storedRecordSchema } from "./db";
import type { DeviceKey } from "./device-key";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * What the marshal entered. Identity, chain position and the audit timestamp
 * are filled in here, so a screen cannot get them wrong.
 */
export type EntryFields = DistributiveOmit<
  RecordV1,
  | "schema"
  | "recordId"
  | "deviceKeyId"
  | "rallyId"
  | "seq"
  | "prevHash"
  | "enteredAtMs"
>;

export type Entry = { record: RecordV1; stored: StoredRecord };

function chainRange(keyId: string) {
  return [
    [keyId, Dexie.minKey],
    [keyId, Dexie.maxKey],
  ] as const;
}

async function headOf(db: LocalDb, keyId: string): Promise<ChainHead> {
  const [lower, upper] = chainRange(keyId);
  const last = await db.records
    .where("[keyId+seq]")
    .between(lower, upper)
    .last();
  if (last === undefined) return null;
  const { seq, hash } = storedRecordSchema.parse(last);
  return { seq, hash };
}

/**
 * Builds the next record of this device's chain, signs it and saves it in
 * one transaction, before anything touches the network. If any step fails,
 * nothing is saved and no seq is used up.
 */
export async function enterRecord(
  db: LocalDb,
  key: DeviceKey,
  fields: EntryFields,
  clock: () => number = Date.now,
): Promise<Entry> {
  return db.transaction("rw", db.records, async () => {
    const position = nextPosition(await headOf(db, key.keyId));
    const record: RecordV1 = {
      ...fields,
      schema: RECORD_SCHEMA_V1,
      recordId: crypto.randomUUID(),
      deviceKeyId: key.keyId,
      rallyId: key.rallyId,
      ...position,
      enteredAtMs: clock(),
    };
    // signRecord validates the record first: an invalid entry throws here
    // and the transaction rolls back. waitFor keeps the transaction open
    // while WebCrypto signs, which IndexedDB would otherwise auto-commit.
    const signed = await Dexie.waitFor(signRecord(record, key.privateKey));
    const stored: StoredRecord = {
      recordId: record.recordId,
      keyId: key.keyId,
      seq: record.seq,
      ...signed,
    };
    await db.records.add(stored);
    return { record, stored };
  });
}

/** The newest entries of this device's chain, newest first. */
export async function latestEntries(
  db: LocalDb,
  key: DeviceKey,
  limit = 20,
): Promise<Entry[]> {
  const [lower, upper] = chainRange(key.keyId);
  const rows = await db.records
    .where("[keyId+seq]")
    .between(lower, upper)
    .reverse()
    .limit(limit)
    .toArray();
  return rows.map((row) => {
    const stored = storedRecordSchema.parse(row);
    // Read from the signed payload, never from separately stored fields.
    const record = recordV1Schema.parse(parseCanonical(stored.payload));
    return { record, stored };
  });
}
