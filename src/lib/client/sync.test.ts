import { count, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST } from "@/app/api/sync/route";
import type { LocalDb } from "@/lib/client/db";
import { type DeviceKey, getOrCreateDeviceKey } from "@/lib/client/device-key";
import { type EntryFields, enterRecord } from "@/lib/client/entry";
import {
  backoffDelay,
  type DrainOutcome,
  drain,
  pendingCount,
  startSync,
} from "@/lib/client/sync";
import { getDb } from "@/lib/server/db/client";
import { records, stages } from "@/lib/server/db/schema";
import { authorizeDevice } from "@/lib/server/devices";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { startTestDatabase } from "../../../test/db";
import { newBrowserProfile, openLocalDb } from "../../../test/local-db";

/** The real sync route, called in-process instead of over the network. */
const server = vi.fn((url: string, init: RequestInit) =>
  POST(new Request(new URL(url, "http://localhost"), init)),
);

const offline = vi.fn(async (_url: string, _init: RequestInit) => {
  throw new TypeError("Failed to fetch");
});

let stopDatabase: () => Promise<void>;
let ss1: { stageId: string; sectionId: string };

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
  await seedDummyRally(getDb());
  const [row] = await getDb()
    .select({ stageId: stages.id, sectionId: stages.sectionId })
    .from(stages)
    .where(eq(stages.number, 1));
  if (row === undefined) throw new Error("SS1 not seeded");
  ss1 = row;
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

/** A phone set up for the dummy rally and authorized for SS1 FINISH. */
async function authorizedPhone(): Promise<{ db: LocalDb; key: DeviceKey }> {
  const db = openLocalDb(newBrowserProfile());
  const key = await getOrCreateDeviceKey(db, DUMMY_RALLY_ID);
  const result = await authorizeDevice(getDb(), {
    publicKey: key.publicKeyHex,
    target: { kind: "stage", number: 1 },
    point: "FINISH",
    rallyId: null,
  });
  if (!result.ok) throw new Error(result.error);
  return { db, key };
}

function finish(carNumber: number, point: "FINISH" | "START" = "FINISH") {
  const fields: EntryFields = {
    sectionId: ss1.sectionId,
    stageId: ss1.stageId,
    controlId: null,
    kind: "TIME",
    point,
    carNumber,
    timeOfDayMs: 54_372_400,
    elapsedMs: null,
    precision: "DS",
    source: "PHOTOCELL_PRINTER",
    sourceRole: "PRIMARY",
    refRecordId: null,
    penaltyMs: null,
    status: null,
    reason: null,
  };
  return fields;
}

async function storedOnServer(key: DeviceKey): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(records)
    .where(eq(records.deviceKeyId, key.keyId));
  return row?.n ?? 0;
}

beforeEach(() => {
  server.mockClear();
  offline.mockClear();
});

describe("drain", () => {
  it("sends the outbox, and the server stores what the phone signed", async () => {
    const { db, key } = await authorizedPhone();
    for (let car = 1; car <= 3; car++) await enterRecord(db, key, finish(car));

    expect(await pendingCount(db, key)).toBe(3);
    expect(await drain(db, key, { post: server })).toEqual({
      online: true,
      pending: 0,
      problem: null,
    });
    expect(await storedOnServer(key)).toBe(3);
    expect(await db.syncState.get(key.keyId)).toMatchObject({ syncedSeq: 2 });
  });

  it("sends nothing when nothing is pending, and so learns nothing", async () => {
    const { db, key } = await authorizedPhone();
    expect(await drain(db, key, { post: server })).toEqual({
      online: null,
      pending: 0,
      problem: null,
    });
    expect(server).not.toHaveBeenCalled();
  });

  it("is offline when the request fails, and sends the same records later", async () => {
    const { db, key } = await authorizedPhone();
    await enterRecord(db, key, finish(1));
    await enterRecord(db, key, finish(2));

    expect(await drain(db, key, { post: offline })).toEqual({
      online: false,
      pending: 2,
      problem: null,
    });
    expect(await drain(db, key, { post: server })).toMatchObject({
      online: true,
      pending: 0,
    });
    expect(await storedOnServer(key)).toBe(2);
  });

  it("is offline when the server answers with an error", async () => {
    const { db, key } = await authorizedPhone();
    await enterRecord(db, key, finish(1));
    const failing = vi.fn(async () => new Response("down", { status: 503 }));
    expect(await drain(db, key, { post: failing })).toMatchObject({
      online: false,
      pending: 1,
    });
  });

  it("sends a long outbox in batches, in chain order", async () => {
    const { db, key } = await authorizedPhone();
    for (let car = 1; car <= 5; car++) await enterRecord(db, key, finish(car));
    expect(await drain(db, key, { post: server, batchSize: 2 })).toMatchObject({
      pending: 0,
    });
    expect(server).toHaveBeenCalledTimes(3);
    expect(await storedOnServer(key)).toBe(5);
  });

  it("keeps a refused record pending, says why, and stores what came before", async () => {
    const { db, key } = await authorizedPhone();
    await enterRecord(db, key, finish(1));
    const refused = await enterRecord(db, key, finish(2, "START"));
    await enterRecord(db, key, finish(3));

    expect(await drain(db, key, { post: server })).toEqual({
      online: true,
      pending: 2,
      problem: { reason: "not-authorized", recordId: refused.record.recordId },
    });
    expect(await storedOnServer(key)).toBe(1);
  });

  it("does not move past a server head that is not this phone's record", async () => {
    const { db, key } = await authorizedPhone();
    await enterRecord(db, key, finish(1));
    const liar = vi.fn(async () =>
      Response.json({
        accepted: 1,
        head: { seq: 0, hash: "00".repeat(32) },
        rejected: null,
      }),
    );
    expect(await drain(db, key, { post: liar })).toEqual({
      online: true,
      pending: 1,
      problem: { reason: "server-chain-differs", recordId: null },
    });
  });

  it("follows the server's head, so records the server lost are sent again", async () => {
    const { db, key } = await authorizedPhone();
    for (let car = 1; car <= 2; car++) await enterRecord(db, key, finish(car));
    await drain(db, key, { post: server });
    await getDb().delete(records).where(eq(records.deviceKeyId, key.keyId));

    await enterRecord(db, key, finish(3));
    await drain(db, key, { post: server });
    // The server, empty for this key, answered with no head: the phone sent
    // from the start of its chain on the next pass.
    await drain(db, key, { post: server });
    expect(await storedOnServer(key)).toBe(3);
  });
});

describe("backoffDelay", () => {
  it("doubles from the base up to the maximum, with half of it random", () => {
    const low = (n: number) => backoffDelay(n, 2_000, 60_000, () => 0);
    const high = (n: number) => backoffDelay(n, 2_000, 60_000, () => 1);
    expect([1, 2, 3, 4].map(low)).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect([1, 2, 3, 4].map(high)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(high(20)).toBe(60_000);
  });
});

describe("startSync", () => {
  const ok: DrainOutcome = { online: true, pending: 0, problem: null };
  const down: DrainOutcome = { online: false, pending: 2, problem: null };

  function harness(outcomes: DrainOutcome[]) {
    const run = vi.fn(async () => outcomes.shift() ?? ok);
    const onStatus = vi.fn();
    const onlineEvents = new EventTarget();
    const visibility = Object.assign(new EventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    const loop = startSync({
      run,
      onStatus,
      intervalMs: 30_000,
      baseBackoffMs: 2_000,
      maxBackoffMs: 60_000,
      random: () => 1,
      onlineEvents,
      visibility,
      locks: undefined,
    });
    return { run, onStatus, onlineEvents, visibility, loop };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains at once, then on the interval", async () => {
    const { run, onStatus, loop } = harness([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(ok);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it("backs off after failures and returns to the interval after a success", async () => {
    const { run, loop } = harness([down, down, down, ok]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(run).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(run).toHaveBeenCalledTimes(4);
    loop.stop();
  });

  it("drains when the browser comes back online or the page is shown", async () => {
    const { run, onlineEvents, visibility, loop } = harness([down]);
    await vi.advanceTimersByTimeAsync(0);
    onlineEvents.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    visibility.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it("drains again right after a kick that arrives mid-drain", async () => {
    let release: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<DrainOutcome>((resolve) => {
          release = () => resolve(ok);
        }),
    );
    const loop = startSync({
      run,
      onStatus: () => {},
      onlineEvents: new EventTarget(),
      visibility: Object.assign(new EventTarget(), {
        visibilityState: "visible" as DocumentVisibilityState,
      }),
      locks: undefined,
    });
    await vi.advanceTimersByTimeAsync(0);
    loop.kick();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it("skips its turn while another tab holds the lock", async () => {
    const run = vi.fn(async () => ok);
    const locks = {
      request: vi.fn(
        async (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => unknown,
        ) => callback(null),
      ),
    } as unknown as Pick<LockManager, "request">;
    const loop = startSync({
      run,
      onStatus: () => {},
      onlineEvents: new EventTarget(),
      visibility: Object.assign(new EventTarget(), {
        visibilityState: "visible" as DocumentVisibilityState,
      }),
      locks,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(locks.request).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    loop.stop();
  });

  it("stops draining and listening once stopped", async () => {
    const { run, onlineEvents, loop } = harness([]);
    await vi.advanceTimersByTimeAsync(0);
    loop.stop();
    onlineEvents.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
