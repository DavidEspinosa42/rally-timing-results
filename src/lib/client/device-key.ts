import "client-only";
import { Dexie } from "dexie";
import { z } from "zod";
import { toHex } from "@/lib/record/hash";
import { publicKeyId } from "@/lib/record/sign";
import { type LocalDb, type StoredKey, storedKeySchema } from "./db";

// One key per device and rally, generated once and authorized once. It is
// never rotated per day: day 2 often starts where there is no signal to
// authorize a new key.

export type DeviceKey = StoredKey;

const rallyIdSchema = z.uuid();

/** This device's key for the rally, or null before setup. */
export async function getDeviceKey(
  db: LocalDb,
  rallyId: string,
): Promise<DeviceKey | null> {
  const row = await db.keys.get(rallyIdSchema.parse(rallyId));
  return row === undefined ? null : storedKeySchema.parse(row);
}

/**
 * Returns this device's key for the rally, generating it the first time.
 * The private key is created non-extractable: nothing, including this app,
 * can export it.
 */
export async function getOrCreateDeviceKey(
  db: LocalDb,
  rallyId: string,
): Promise<DeviceKey> {
  const existing = await getDeviceKey(db, rallyId);
  if (existing !== null) return existing;

  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    false,
    ["sign", "verify"],
  );
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  const key: DeviceKey = {
    rallyId,
    keyId: await publicKeyId(publicKey),
    publicKeyHex: toHex(new Uint8Array(raw)),
    privateKey,
    publicKey,
    createdAtMs: Date.now(),
  };

  try {
    await db.keys.add(key);
    return key;
  } catch (error) {
    // Another tab set up the same rally first; its key is the device's key.
    if (error instanceof Dexie.ConstraintError) {
      const winner = await getDeviceKey(db, rallyId);
      if (winner !== null) return winner;
    }
    throw error;
  }
}
