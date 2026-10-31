"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeviceInfo, RallySummary } from "@/lib/api/contract";
import type { LocalDb } from "@/lib/client/db";
import { type DeviceKey, getOrCreateDeviceKey } from "@/lib/client/device-key";
import { fetchDevice, fetchRallies } from "@/lib/client/setup";
import { type Persistence, requestPersistence } from "@/lib/client/support";
import { StorageBadge } from "./storage-badge";

const NO_CONNECTION =
  "Could not reach the server. Check the connection, then try again.";

/** True in an iOS Safari tab, where the Home Screen app would get its own storage. */
function inIosSafariTab(): boolean {
  return Reflect.get(navigator, "standalone") === false;
}

function ChooseRally({ onChoose }: { onChoose: (rallyId: string) => void }) {
  const [rallies, setRallies] = useState<RallySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchRallies();
      const [only, ...others] = list;
      if (only !== undefined && others.length === 0) onChoose(only.id);
      else setRallies(list);
    } catch {
      setError(NO_CONNECTION);
    }
  }, [onChoose]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="font-semibold text-alert">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="h-14 rounded-md border-2 border-ink text-lg font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }
  if (rallies === null)
    return <p className="text-graphite">Finding rallies…</p>;
  if (rallies.length === 0) {
    return <p>There is no rally on the server yet.</p>;
  }
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-semibold">Choose the rally</h2>
      <p className="text-graphite">This phone records for one rally.</p>
      {rallies.map((rally) => (
        <button
          key={rally.id}
          type="button"
          onClick={() => onChoose(rally.id)}
          className="min-h-14 rounded-md border-2 border-ink px-4 text-left text-lg font-semibold"
        >
          {rally.name}
        </button>
      ))}
    </div>
  );
}

function PublicKey({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false);
  const groups = hex.match(/.{8}/g) ?? [hex];
  return (
    <div className="grid gap-3">
      <p className="grid select-all grid-cols-2 gap-x-6 gap-y-1 rounded-md border-2 border-ink p-3 font-mono text-lg">
        {groups.map((group, index) => (
          // Groups are positional: the same text can repeat in a key.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
          <span key={index}>{group}</span>
        ))}
      </p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(hex).then(() => setCopied(true));
        }}
        className="h-12 rounded-md border-2 border-ink font-semibold"
      >
        {copied ? "Copied" : "Copy key"}
      </button>
    </div>
  );
}

function AwaitAuthorization({
  db,
  deviceKey,
  onAuthorized,
}: {
  db: LocalDb;
  deviceKey: DeviceKey;
  onAuthorized: (device: DeviceInfo) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const device = await fetchDevice(db, deviceKey.keyId);
      if (device === null) setStatus("Not authorized yet.");
      else onAuthorized(device);
    } catch {
      setStatus(NO_CONNECTION);
    } finally {
      setChecking(false);
    }
  }, [db, deviceKey, onAuthorized]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">
        Ask the organizer to authorize this device
      </h2>
      <p>
        Give them this key. It is safe to share: it can check this phone's
        signatures but cannot make them.
      </p>
      <PublicKey hex={deviceKey.publicKeyHex} />
      <button
        type="button"
        onClick={() => void check()}
        disabled={checking}
        className="h-14 rounded-md bg-board text-lg font-bold text-black disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check authorization"}
      </button>
      <p aria-live="polite" className="min-h-6 text-graphite">
        {status}
      </p>
    </div>
  );
}

/**
 * Setup happens once, before the rally and with a connection: choose the
 * rally, create the key, and wait for the organizer to authorize it.
 */
export function SetupView({
  db,
  rallyId,
  deviceKey,
  persistence,
  onRallyChosen,
  onKey,
  onPersistence,
  onAuthorized,
}: {
  db: LocalDb;
  rallyId: string | null;
  deviceKey: DeviceKey | null;
  persistence: Persistence;
  onRallyChosen: (rallyId: string) => void;
  onKey: (key: DeviceKey) => void;
  onPersistence: (persistence: Persistence) => void;
  onAuthorized: (device: DeviceInfo) => void;
}) {
  const [settingUp, setSettingUp] = useState(false);
  const [iosTab, setIosTab] = useState(false);

  useEffect(() => {
    setIosTab(inIosSafariTab());
  }, []);

  if (rallyId === null) return <ChooseRally onChoose={onRallyChosen} />;

  if (deviceKey !== null) {
    return (
      <>
        <AwaitAuthorization
          db={db}
          deviceKey={deviceKey}
          onAuthorized={onAuthorized}
        />
        <div className="mt-6">
          <StorageBadge persistence={persistence} />
        </div>
      </>
    );
  }

  async function setUp(chosen: string) {
    setSettingUp(true);
    try {
      // From the tap itself: Firefox asks the user, and only for a gesture.
      onPersistence(await requestPersistence());
      onKey(await getOrCreateDeviceKey(db, chosen));
    } finally {
      setSettingUp(false);
    }
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">Set up this device</h2>
      <p>
        This creates the key that signs every entry made on this phone. Do it
        once, before the rally, where you have a connection.
      </p>
      {iosTab && (
        <p className="rounded-md border-2 border-alert p-3 font-semibold">
          On iPhone and iPad, add this page to the Home Screen first and set up
          from there. The Home Screen app keeps its own storage, so a key made
          in this tab would not be there.
        </p>
      )}
      <button
        type="button"
        onClick={() => void setUp(rallyId)}
        disabled={settingUp}
        className="h-16 rounded-md bg-board text-xl font-bold text-black disabled:opacity-50"
      >
        {settingUp ? "Setting up…" : "Set up this device"}
      </button>
      <StorageBadge persistence={persistence} />
    </div>
  );
}
