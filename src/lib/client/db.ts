import "client-only";
import { Dexie, type DexieOptions, type EntityTable } from "dexie";
import { z } from "zod";
import { deviceInfoSchema, REJECT_REASONS } from "@/lib/api/contract";

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

// Rows read back from IndexedDB may have been written by an older version of
// the app, so they are parsed before use instead of trusted.

/** The device's one key for a rally. The private key never leaves this row. */
export const storedKeySchema = z.strictObject({
  rallyId: z.uuid(),
  // SHA-256 of the raw public key: the deviceKeyId in every record.
  keyId: sha256Hex,
  // The raw 32-byte public key, hex: what the organizer authorizes.
  publicKeyHex: sha256Hex,
  privateKey: z.instanceof(CryptoKey),
  publicKey: z.instanceof(CryptoKey),
  createdAtMs: z.int().min(0),
});
export type StoredKey = z.infer<typeof storedKeySchema>;

/**
 * A signed record exactly as it will be sent, plus the fields it is looked up
 * by. Rows are only ever added: sync progress is tracked elsewhere, so the
 * local copy stays append-only like the server's.
 */
export const storedRecordSchema = z.strictObject({
  recordId: z.uuid(),
  keyId: sha256Hex,
  seq: z.int().min(0),
  payload: z.string(),
  hash: sha256Hex,
  signature: z.string().regex(/^[0-9a-f]{128}$/),
});
export type StoredRecord = z.infer<typeof storedRecordSchema>;

/** The rally this phone was set up for: the one key it signs with. */
export const settingSchema = z.strictObject({
  name: z.literal("rallyId"),
  value: z.uuid(),
});
export type Setting = z.infer<typeof settingSchema>;

/**
 * The device's grants as the server last described them, so the entry screen
 * still works where there is no signal.
 */
export const cachedDeviceSchema = z.strictObject({
  keyId: sha256Hex,
  info: deviceInfoSchema,
  fetchedAtMs: z.int().min(0),
});
export type CachedDevice = z.infer<typeof cachedDeviceSchema>;

/**
 * How far this key's chain has reached the server. Records with a higher seq
 * are the outbox; the records themselves are never marked or changed.
 */
export const syncStateSchema = z.strictObject({
  keyId: sha256Hex,
  // The server's last record for this key; -1 before any.
  syncedSeq: z.int().min(-1),
  lastSuccessAtMs: z.int().min(0).nullable(),
  // Why the server stopped at the next record, if it did.
  problem: z
    .strictObject({
      reason: z.enum([...REJECT_REASONS, "server-chain-differs"]),
      recordId: z.string().nullable(),
    })
    .nullable(),
});
export type SyncState = z.infer<typeof syncStateSchema>;

export const LOCAL_DB_NAME = "rally-timing";

export class LocalDb extends Dexie {
  declare readonly keys: EntityTable<StoredKey, "rallyId">;
  declare readonly records: EntityTable<StoredRecord, "recordId">;
  declare readonly settings: EntityTable<Setting, "name">;
  declare readonly devices: EntityTable<CachedDevice, "keyId">;
  declare readonly syncState: EntityTable<SyncState, "keyId">;

  constructor(name: string = LOCAL_DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      keys: "rallyId, &keyId",
      // One chain per key: a seq can appear only once.
      records: "recordId, &[keyId+seq]",
    });
    // Adds tables only: existing keys and records are kept as they are.
    this.version(2).stores({
      settings: "name",
      devices: "keyId",
    });
    this.version(3).stores({ syncState: "keyId" });
  }
}

let shared: LocalDb | undefined;

/** The app's database, opened on first use. */
export function localDb(): LocalDb {
  shared ??= new LocalDb();
  return shared;
}
