"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceInfo } from "@/lib/api/contract";
import { type LocalDb, localDb } from "@/lib/client/db";
import { type DeviceKey, getDeviceKey } from "@/lib/client/device-key";
import {
  cachedDevice,
  chooseRally,
  chosenRally,
  fetchDevice,
} from "@/lib/client/setup";
import {
  checkSupport,
  type Missing,
  type Persistence,
  storagePersistence,
} from "@/lib/client/support";
import {
  type DrainOutcome,
  drain,
  type SyncLoop,
  startSync,
} from "@/lib/client/sync";
import { EntryView } from "./entry-view";
import { SetupView } from "./setup-view";

type State =
  | { view: "loading" }
  | { view: "unsupported"; missing: Missing[] }
  | {
      view: "setup";
      db: LocalDb;
      rallyId: string | null;
      deviceKey: DeviceKey | null;
    }
  | { view: "entry"; db: LocalDb; deviceKey: DeviceKey; device: DeviceInfo };

const MISSING_REASONS: Readonly<Record<Missing, string>> = {
  "secure-context":
    "The page must be opened over HTTPS, or on this computer as localhost.",
  indexeddb:
    "The browser cannot store data for this site, as in some private windows.",
  ed25519:
    "The browser cannot sign entries. Use Chrome 137, Firefox 129, Safari 17 or later.",
};

export function EntryApp() {
  const [state, setState] = useState<State>({ view: "loading" });
  const [persistence, setPersistence] = useState<Persistence>("unknown");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const support = await checkSupport();
      if (!support.supported) {
        if (!cancelled)
          setState({ view: "unsupported", missing: support.missing });
        return;
      }
      const db = localDb();
      const rallyId = await chosenRally(db);
      const deviceKey =
        rallyId === null ? null : await getDeviceKey(db, rallyId);
      const device =
        deviceKey === null ? null : await cachedDevice(db, deviceKey.keyId);
      const stored = await storagePersistence();
      if (cancelled) return;
      setPersistence(stored);
      setState(
        deviceKey !== null && device !== null
          ? { view: "entry", db, deviceKey, device }
          : { view: "setup", db, rallyId, deviceKey },
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Grants can change after setup (a new point, a revocation). Ask once per
  // visit; without a connection the cached answer stands.
  const entryKey = state.view === "entry" ? state.deviceKey : null;
  const entryDb = state.view === "entry" ? state.db : null;
  useEffect(() => {
    if (entryKey === null || entryDb === null) return;
    let cancelled = false;
    fetchDevice(entryDb, entryKey.keyId).then(
      (device) => {
        if (cancelled) return;
        setState(
          device === null
            ? {
                view: "setup",
                db: entryDb,
                rallyId: entryKey.rallyId,
                deviceKey: entryKey,
              }
            : { view: "entry", db: entryDb, deviceKey: entryKey, device },
        );
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [entryKey, entryDb]);

  // The outbox drains while the entry screen is open, for an authorized,
  // unrevoked device. Entries are saved before this, so it can fail freely.
  const [syncStatus, setSyncStatus] = useState<DrainOutcome | null>(null);
  const syncLoop = useRef<SyncLoop | null>(null);
  const revoked = state.view === "entry" && state.device.revoked;
  useEffect(() => {
    if (entryKey === null || entryDb === null || revoked) return;
    const loop = startSync({
      run: () => drain(entryDb, entryKey),
      onStatus: setSyncStatus,
    });
    syncLoop.current = loop;
    return () => {
      loop.stop();
      syncLoop.current = null;
    };
  }, [entryKey, entryDb, revoked]);

  const onRallyChosen = useCallback(
    (rallyId: string) => {
      if (state.view !== "setup") return;
      const { db } = state;
      void chooseRally(db, rallyId).then(() =>
        setState({ view: "setup", db, rallyId, deviceKey: null }),
      );
    },
    [state],
  );

  if (state.view === "loading") {
    return <p className="text-graphite">Opening…</p>;
  }

  if (state.view === "unsupported") {
    return (
      <div className="grid gap-3">
        <h2 className="text-xl font-semibold">This browser is not supported</h2>
        <ul className="list-disc pl-5">
          {state.missing.map((missing) => (
            <li key={missing}>{MISSING_REASONS[missing]}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.view === "setup") {
    const { db, rallyId, deviceKey } = state;
    return (
      <SetupView
        db={db}
        rallyId={rallyId}
        deviceKey={deviceKey}
        persistence={persistence}
        onRallyChosen={onRallyChosen}
        onPersistence={setPersistence}
        onKey={(key) =>
          setState({ view: "setup", db, rallyId, deviceKey: key })
        }
        onAuthorized={(device) => {
          if (deviceKey !== null) {
            setState({ view: "entry", db, deviceKey, device });
          }
        }}
      />
    );
  }

  if (state.device.revoked) {
    return (
      <div className="grid gap-3">
        <h2 className="text-xl font-semibold text-alert">
          This device was revoked
        </h2>
        <p>
          The organizer withdrew its authorization, so the server refuses its
          entries. Entries already saved stay on this phone.
        </p>
      </div>
    );
  }

  return (
    <EntryView
      db={state.db}
      deviceKey={state.deviceKey}
      device={state.device}
      persistence={persistence}
      syncStatus={syncStatus}
      onSaved={() => syncLoop.current?.kick()}
    />
  );
}
