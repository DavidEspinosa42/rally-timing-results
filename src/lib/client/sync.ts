import "client-only";
import { Dexie } from "dexie";
import { MAX_BATCH_RECORDS, syncResultSchema } from "@/lib/api/contract";
import {
  type LocalDb,
  type SyncState,
  storedRecordSchema,
  syncStateSchema,
} from "./db";
import type { DeviceKey } from "./device-key";

// The outbox is every record above the key's synced seq. Entries are signed
// and saved before any of this runs, so a failed request costs nothing: the
// records wait on the phone until a later attempt gets through.

type Post = (url: string, init: RequestInit) => Promise<Response>;

export type SyncProblem = NonNullable<SyncState["problem"]>;

/**
 * What one drain learned. `online` is true when the server answered, false
 * when a request failed (whatever navigator.onLine says), and null when
 * there was nothing to send, so nothing was learned.
 */
export type DrainOutcome = {
  online: boolean | null;
  pending: number;
  problem: SyncProblem | null;
};

async function loadState(db: LocalDb, keyId: string): Promise<SyncState> {
  const row = await db.syncState.get(keyId);
  if (row === undefined) {
    return { keyId, syncedSeq: -1, lastSuccessAtMs: null, problem: null };
  }
  return syncStateSchema.parse(row);
}

function outbox(db: LocalDb, keyId: string, syncedSeq: number) {
  return db.records
    .where("[keyId+seq]")
    .between([keyId, syncedSeq + 1], [keyId, Dexie.maxKey]);
}

export async function pendingCount(
  db: LocalDb,
  key: DeviceKey,
): Promise<number> {
  const { syncedSeq } = await loadState(db, key.keyId);
  return outbox(db, key.keyId, syncedSeq).count();
}

/**
 * Sends the outbox in chain order, one batch at a time, until it is empty,
 * a request fails, or the server refuses a record. The synced seq always
 * follows the server's own head, so a server that lost records gets them
 * again on the next drain.
 */
export async function drain(
  db: LocalDb,
  key: DeviceKey,
  options: { post?: Post; batchSize?: number; clock?: () => number } = {},
): Promise<DrainOutcome> {
  const post = options.post ?? ((url, init) => fetch(url, init));
  const batchSize = options.batchSize ?? MAX_BATCH_RECORDS;
  const clock = options.clock ?? Date.now;
  let state = await loadState(db, key.keyId);
  let online: boolean | null = null;

  for (;;) {
    const rows = await outbox(db, key.keyId, state.syncedSeq)
      .limit(batchSize)
      .toArray();
    if (rows.length === 0) break;
    const records = rows.map((row) => {
      const { payload, hash, signature } = storedRecordSchema.parse(row);
      return { payload, hash, signature };
    });

    let body: unknown;
    try {
      const response = await post("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.json();
    } catch {
      online = false;
      break;
    }
    const result = syncResultSchema.parse(body);
    online = true;

    let syncedSeq = result.head?.seq ?? -1;
    let problem: SyncProblem | null =
      result.rejected === null
        ? null
        : {
            reason: result.rejected.reason,
            recordId: result.rejected.recordId,
          };
    // The server's head must be a record of this phone's own chain.
    if (result.head !== null) {
      const local = await db.records
        .where("[keyId+seq]")
        .equals([key.keyId, result.head.seq])
        .first();
      if (local?.hash !== result.head.hash) {
        problem = { reason: "server-chain-differs", recordId: null };
        syncedSeq = state.syncedSeq;
      }
    }

    const before = state.syncedSeq;
    state = { ...state, syncedSeq, lastSuccessAtMs: clock(), problem };
    await db.syncState.put(state);
    // Stop when refused, when the batch was the last one, or when the
    // server made no progress (so a bad answer cannot loop forever).
    if (problem !== null || rows.length < batchSize || syncedSeq <= before) {
      break;
    }
  }

  return {
    online,
    pending: await outbox(db, key.keyId, state.syncedSeq).count(),
    problem: state.problem,
  };
}

/** Exponential backoff with "equal jitter": half fixed, half random. */
export function backoffDelay(
  failures: number,
  baseMs: number,
  maxMs: number,
  random: () => number,
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
  return ceiling / 2 + random() * (ceiling / 2);
}

type VisibilityTarget = EventTarget & {
  readonly visibilityState: DocumentVisibilityState;
};

export type SyncLoopOptions = {
  run: () => Promise<DrainOutcome>;
  onStatus: (outcome: DrainOutcome) => void;
  intervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
  /** Where `online` fires (window) and where visibility changes (document). */
  onlineEvents?: EventTarget;
  visibility?: VisibilityTarget;
  /** Only one tab drains at a time; without Web Locks, each tab does. */
  locks?: Pick<LockManager, "request"> | undefined;
};

export type SyncLoop = { kick: () => void; stop: () => void };

export const SYNC_LOCK = "rally-timing-results-sync";

/**
 * Drains now, then again on `online`, when the page becomes visible, after
 * each kick (a saved entry), and on an interval. Failures back off with
 * jitter so many phones regaining signal at once do not retry in step.
 */
export function startSync(options: SyncLoopOptions): SyncLoop {
  const intervalMs = options.intervalMs ?? 30_000;
  const baseMs = options.baseBackoffMs ?? 2_000;
  const maxMs = options.maxBackoffMs ?? 5 * 60_000;
  const random = options.random ?? Math.random;
  const onlineEvents = options.onlineEvents ?? window;
  const visibility = options.visibility ?? document;
  const locks =
    "locks" in options ? options.locks : globalThis.navigator?.locks;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let failures = 0;

  function schedule(delayMs: number) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void tick(), delayMs);
  }

  function runLocked(): Promise<DrainOutcome | null> {
    if (locks === undefined) return options.run();
    // Another tab is draining the same outbox: skip this turn.
    return locks.request(SYNC_LOCK, { ifAvailable: true }, (lock) =>
      lock === null ? null : options.run(),
    );
  }

  async function tick() {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    let next = intervalMs;
    try {
      const outcome = await runLocked();
      if (outcome !== null) {
        if (outcome.online === false) {
          failures += 1;
          next = backoffDelay(failures, baseMs, maxMs, random);
        } else {
          failures = 0;
        }
        if (!stopped) options.onStatus(outcome);
      }
    } catch {
      failures += 1;
      next = backoffDelay(failures, baseMs, maxMs, random);
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      schedule(0);
    } else {
      schedule(next);
    }
  }

  function kick() {
    if (running) again = true;
    else schedule(0);
  }

  const onOnline = () => kick();
  const onVisibility = () => {
    if (visibility.visibilityState === "visible") kick();
  };
  onlineEvents.addEventListener("online", onOnline);
  visibility.addEventListener("visibilitychange", onVisibility);
  schedule(0);

  return {
    kick,
    stop() {
      stopped = true;
      clearTimeout(timer);
      onlineEvents.removeEventListener("online", onOnline);
      visibility.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
