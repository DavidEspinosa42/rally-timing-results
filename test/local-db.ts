import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { LocalDb } from "@/lib/client/db";

/**
 * A browser profile of its own: a fresh in-memory IndexedDB. Open the same
 * factory again to simulate reopening the app on the same device.
 */
export function newBrowserProfile(): IDBFactory {
  return new IDBFactory();
}

export function openLocalDb(profile: IDBFactory): LocalDb {
  return new LocalDb("rally-timing-results-test", {
    indexedDB: profile,
    IDBKeyRange,
  });
}
