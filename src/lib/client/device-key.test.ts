import { afterEach, describe, expect, it } from "vitest";
import type { LocalDb } from "@/lib/client/db";
import { getDeviceKey, getOrCreateDeviceKey } from "@/lib/client/device-key";
import { fromHex, sha256Hex } from "@/lib/record/hash";
import { signRecord, verifyRecord } from "@/lib/record/sign";
import { IDS, timeRecord } from "../../../test/fixtures";
import { newBrowserProfile, openLocalDb } from "../../../test/local-db";

const OTHER_RALLY = "00000000-0000-4000-8000-000000000099";

const opened: LocalDb[] = [];
function open(profile = newBrowserProfile()): LocalDb {
  const db = openLocalDb(profile);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("getOrCreateDeviceKey", () => {
  it("creates the key once and returns the same one afterwards", async () => {
    const db = open();
    expect(await getDeviceKey(db, IDS.rally)).toBeNull();
    const first = await getOrCreateDeviceKey(db, IDS.rally);
    const again = await getOrCreateDeviceKey(db, IDS.rally);
    expect(again.keyId).toBe(first.keyId);
    expect(await db.keys.count()).toBe(1);
  });

  it("keeps the key when the app is reopened", async () => {
    const profile = newBrowserProfile();
    const created = await getOrCreateDeviceKey(open(profile), IDS.rally);
    const reopened = await getDeviceKey(open(profile), IDS.rally);
    expect(reopened?.keyId).toBe(created.keyId);
  });

  it("uses a different key for another rally", async () => {
    const db = open();
    const a = await getOrCreateDeviceKey(db, IDS.rally);
    const b = await getOrCreateDeviceKey(db, OTHER_RALLY);
    expect(b.keyId).not.toBe(a.keyId);
  });

  it("ends with one key when two tabs set up the rally at once", async () => {
    const profile = newBrowserProfile();
    const [a, b] = await Promise.all([
      getOrCreateDeviceKey(open(profile), IDS.rally),
      getOrCreateDeviceKey(open(profile), IDS.rally),
    ]);
    expect(a.keyId).toBe(b.keyId);
    expect(await open(profile).keys.count()).toBe(1);
  });

  it("stores a private key that cannot be exported, even after reopening", async () => {
    const profile = newBrowserProfile();
    await getOrCreateDeviceKey(open(profile), IDS.rally);
    const stored = await getDeviceKey(open(profile), IDS.rally);
    if (stored === null) throw new Error("key not stored");
    expect(stored.privateKey.extractable).toBe(false);
    await expect(
      crypto.subtle.exportKey("pkcs8", stored.privateKey),
    ).rejects.toThrow();
    await expect(
      crypto.subtle.exportKey("jwk", stored.privateKey),
    ).rejects.toThrow();
  });

  it("derives the key id from the public key the organizer authorizes", async () => {
    const key = await getOrCreateDeviceKey(open(), IDS.rally);
    const raw = fromHex(key.publicKeyHex);
    if (raw === null) throw new Error("public key is not hex");
    expect(raw).toHaveLength(32);
    expect(key.keyId).toBe(await sha256Hex(raw));
  });

  it("signs records that verify with its public key", async () => {
    const profile = newBrowserProfile();
    await getOrCreateDeviceKey(open(profile), IDS.rally);
    const key = await getDeviceKey(open(profile), IDS.rally);
    if (key === null) throw new Error("key not stored");
    const signed = await signRecord(
      { ...timeRecord(), deviceKeyId: key.keyId },
      key.privateKey,
    );
    expect((await verifyRecord(signed, key.publicKey)).ok).toBe(true);
  });

  it("rejects a rally id that is not a UUID", async () => {
    await expect(getOrCreateDeviceKey(open(), "rally-1")).rejects.toThrow();
  });

  it("rejects a stored key row that does not have the expected shape", async () => {
    const db = open();
    const key = await getOrCreateDeviceKey(db, IDS.rally);
    await db.keys.put({ ...key, keyId: "not-a-hash" });
    await expect(getDeviceKey(db, IDS.rally)).rejects.toThrow();
  });
});
