import "client-only";
import { Dexie, type DexieOptions, type EntityTable } from "dexie";
import { z } from "zod";

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

export const LOCAL_DB_NAME = "rally-timing";

export class LocalDb extends Dexie {
  declare readonly keys: EntityTable<StoredKey, "rallyId">;
  declare readonly records: EntityTable<StoredRecord, "recordId">;

  constructor(name: string = LOCAL_DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      keys: "rallyId, &keyId",
      // One chain per key: a seq can appear only once.
      records: "recordId, &[keyId+seq]",
    });
  }
}

let shared: LocalDb | undefined;

/** The app's database, opened on first use. */
export function localDb(): LocalDb {
  shared ??= new LocalDb();
  return shared;
}
