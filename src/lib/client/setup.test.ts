import { Dexie } from "dexie";
import { IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceInfo } from "@/lib/api/contract";
import type { LocalDb } from "@/lib/client/db";
import { getOrCreateDeviceKey } from "@/lib/client/device-key";
import {
  cachedDevice,
  chooseRally,
  chosenRally,
  fetchDevice,
  fetchRallies,
} from "@/lib/client/setup";
import { IDS } from "../../../test/fixtures";
import { newBrowserProfile, openLocalDb } from "../../../test/local-db";

const KEY_ID = "ab".repeat(32);

const device: DeviceInfo = {
  keyId: KEY_ID,
  rallyId: IDS.rally,
  revoked: false,
  grants: [
    {
      sectionId: IDS.section,
      point: "FINISH",
      target: {
        kind: "stage",
        stageId: IDS.stage,
        number: 1,
        name: "Stage 1",
        scoring: true,
        isPowerStage: false,
      },
    },
  ],
};

/** A server that answers every request with this status and body. */
function server(status: number, body: unknown) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
}

const offline = vi.fn(async () => {
  throw new TypeError("Failed to fetch");
});

const opened: LocalDb[] = [];
function open(profile = newBrowserProfile()): LocalDb {
  const db = openLocalDb(profile);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("chosen rally", () => {
  it("is null before setup and remembered after", async () => {
    const profile = newBrowserProfile();
    expect(await chosenRally(open(profile))).toBeNull();
    await chooseRally(open(profile), IDS.rally);
    expect(await chosenRally(open(profile))).toBe(IDS.rally);
  });

  it("must be a rally id", async () => {
    await expect(chooseRally(open(), "rally-1")).rejects.toThrow();
  });
});

describe("fetchRallies", () => {
  it("returns the server's list", async () => {
    const list = [{ id: IDS.rally, name: "Dummy Regional Rally" }];
    const fetcher = server(200, list);
    expect(await fetchRallies(fetcher)).toEqual(list);
    expect(fetcher).toHaveBeenCalledWith("/api/rallies", { cache: "no-store" });
  });

  it("throws on an error status or an unexpected body", async () => {
    await expect(fetchRallies(server(503, {}))).rejects.toThrow("HTTP 503");
    await expect(
      fetchRallies(server(200, [{ id: "x", name: 1 }])),
    ).rejects.toThrow();
  });
});

describe("fetchDevice", () => {
  it("caches what the server says the device may enter", async () => {
    const db = open();
    expect(
      await fetchDevice(db, KEY_ID, server(200, device), () => 42),
    ).toEqual(device);
    expect(await cachedDevice(db, KEY_ID)).toEqual(device);
    expect(await db.devices.get(KEY_ID)).toMatchObject({ fetchedAtMs: 42 });
  });

  it("returns null while the key is not authorized, and forgets an old answer", async () => {
    const db = open();
    await fetchDevice(db, KEY_ID, server(200, device));
    expect(await fetchDevice(db, KEY_ID, server(404, {}))).toBeNull();
    expect(await cachedDevice(db, KEY_ID)).toBeNull();
  });

  it("keeps the cached answer when the server cannot be reached", async () => {
    const db = open();
    await fetchDevice(db, KEY_ID, server(200, device));
    await expect(fetchDevice(db, KEY_ID, offline)).rejects.toThrow();
    await expect(fetchDevice(db, KEY_ID, server(500, {}))).rejects.toThrow();
    expect(await cachedDevice(db, KEY_ID)).toEqual(device);
  });

  it("refuses an answer about another key", async () => {
    const other = { ...device, keyId: "cd".repeat(32) };
    await expect(
      fetchDevice(open(), KEY_ID, server(200, other)),
    ).rejects.toThrow("another key");
  });
});

describe("local database upgrade", () => {
  it("keeps a key written by the first schema version through every upgrade", async () => {
    // A key made elsewhere, then stored through the version 1 schema alone.
    const key = await getOrCreateDeviceKey(open(), IDS.rally);
    const profile = newBrowserProfile();
    const v1 = new Dexie("rally-timing-results-test", {
      indexedDB: profile,
      IDBKeyRange,
    });
    v1.version(1).stores({
      keys: "rallyId, &keyId",
      records: "recordId, &[keyId+seq]",
    });
    await v1.table("keys").add(key);
    v1.close();

    const upgraded = open(profile);
    expect((await upgraded.keys.get(IDS.rally))?.keyId).toBe(key.keyId);
    expect(upgraded.verno).toBe(3);
    expect(await upgraded.settings.count()).toBe(0);
    expect(await upgraded.syncState.count()).toBe(0);
  });
});
