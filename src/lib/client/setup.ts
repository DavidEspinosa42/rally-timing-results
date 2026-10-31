import "client-only";
import {
  type DeviceInfo,
  deviceInfoSchema,
  type RallySummary,
  ralliesResponseSchema,
} from "@/lib/api/contract";
import { cachedDeviceSchema, type LocalDb, settingSchema } from "./db";

// Setup needs a connection once: to choose the rally and to learn the grants
// after the organizer authorizes the key. From then on the cached copy is
// enough to keep entering times offline.

type Fetch = typeof fetch;

/** The rally this phone was set up for, or null before setup. */
export async function chosenRally(db: LocalDb): Promise<string | null> {
  const row = await db.settings.get("rallyId");
  return row === undefined ? null : settingSchema.parse(row).value;
}

export async function chooseRally(db: LocalDb, rallyId: string): Promise<void> {
  await db.settings.put(
    settingSchema.parse({ name: "rallyId", value: rallyId }),
  );
}

/** Every rally on the server. Throws when the server cannot be reached. */
export async function fetchRallies(
  fetcher: Fetch = fetch,
): Promise<RallySummary[]> {
  const response = await fetcher("/api/rallies", { cache: "no-store" });
  if (!response.ok) throw new Error(`rallies: HTTP ${response.status}`);
  return ralliesResponseSchema.parse(await response.json());
}

/**
 * Asks the server what this key may enter and caches the answer. Returns
 * null while the key is not authorized. Throws when the server cannot be
 * reached, so the caller can fall back to the cached copy.
 */
export async function fetchDevice(
  db: LocalDb,
  keyId: string,
  fetcher: Fetch = fetch,
  clock: () => number = Date.now,
): Promise<DeviceInfo | null> {
  const response = await fetcher(`/api/devices/${keyId}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    await db.devices.delete(keyId);
    return null;
  }
  if (!response.ok) throw new Error(`device: HTTP ${response.status}`);
  const info = deviceInfoSchema.parse(await response.json());
  if (info.keyId !== keyId)
    throw new Error("device: answer is for another key");
  await db.devices.put({ keyId, info, fetchedAtMs: clock() });
  return info;
}

/** The last answer from the server about this key, if any. */
export async function cachedDevice(
  db: LocalDb,
  keyId: string,
): Promise<DeviceInfo | null> {
  const row = await db.devices.get(keyId);
  return row === undefined ? null : cachedDeviceSchema.parse(row).info;
}
