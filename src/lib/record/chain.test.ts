import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type ChainHead, nextPosition, verifyChain } from "@/lib/record/chain";
import { hashRecord } from "@/lib/record/hash";
import type { TimeRecord } from "@/lib/record/types";
import { timeRecord } from "../../../test/fixtures";

type TimeLink = { record: TimeRecord; hash: string };

/** Links `count` records after `after`, the way a device appends them. */
async function buildChain(
  count: number,
  after: ChainHead = null,
): Promise<TimeLink[]> {
  const links: TimeLink[] = [];
  let head = after;
  for (let i = 0; i < count; i++) {
    const record = {
      ...timeRecord(),
      ...nextPosition(head),
      recordId: crypto.randomUUID(),
      carNumber: 1 + (i % 999),
    };
    const hash = await hashRecord(record);
    links.push({ record, hash });
    head = { seq: record.seq, hash };
  }
  return links;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

const chainLength = fc.integer({ min: 2, max: 12 });

describe("nextPosition", () => {
  it("starts a chain at seq 0 with no prevHash", () => {
    expect(nextPosition(null)).toEqual({ seq: 0, prevHash: null });
  });

  it("follows the head", () => {
    expect(nextPosition({ seq: 4, hash: "ab".repeat(32) })).toEqual({
      seq: 5,
      prevHash: "ab".repeat(32),
    });
  });
});

describe("verifyChain", () => {
  it("accepts an empty batch and keeps the head", () => {
    const head = { seq: 3, hash: "ab".repeat(32) };
    expect(verifyChain([], head)).toEqual({ ok: true, head });
    expect(verifyChain([])).toEqual({ ok: true, head: null });
  });

  it("accepts any chain built in order and returns its last link", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (length) => {
        const links = await buildChain(length);
        const last = at(links, length - 1);
        expect(verifyChain(links)).toEqual({
          ok: true,
          head: { seq: last.record.seq, hash: last.hash },
        });
      }),
      { numRuns: 25 },
    );
  });

  it("continues a chain from a trusted head", async () => {
    const stored = await buildChain(3);
    const last = at(stored, 2);
    const head = { seq: last.record.seq, hash: last.hash };
    const batch = await buildChain(2, head);
    expect(verifyChain(batch, head).ok).toBe(true);
    expect(verifyChain(batch)).toEqual({ ok: false, index: 0, reason: "gap" });
  });

  it("detects a batch that does not continue the head", async () => {
    const batch = await buildChain(2, { seq: 2, hash: "ab".repeat(32) });
    expect(verifyChain(batch, { seq: 2, hash: "cd".repeat(32) })).toEqual({
      ok: false,
      index: 0,
      reason: "broken-link",
    });
  });

  it("detects a removed record (a gap)", async () => {
    await fc.assert(
      fc.asyncProperty(
        chainLength.chain((length) =>
          fc.tuple(fc.constant(length), fc.nat({ max: length - 2 })),
        ),
        async ([length, removed]) => {
          const links = await buildChain(length);
          links.splice(removed, 1);
          expect(verifyChain(links)).toEqual({
            ok: false,
            index: removed,
            reason: "gap",
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  it("detects two records swapped", async () => {
    await fc.assert(
      fc.asyncProperty(
        chainLength.chain((length) =>
          fc.tuple(fc.constant(length), fc.nat({ max: length - 2 })),
        ),
        async ([length, first]) => {
          const links = await buildChain(length);
          const a = at(links, first);
          links[first] = at(links, first + 1);
          links[first + 1] = a;
          expect(verifyChain(links)).toEqual({
            ok: false,
            index: first,
            reason: "gap",
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  it("detects a record that repeats an earlier seq", async () => {
    const links = await buildChain(3);
    const replay = [...links, at(links, 1)];
    expect(verifyChain(replay)).toEqual({
      ok: false,
      index: 3,
      reason: "out-of-order",
    });
  });

  it("detects a broken prevHash", async () => {
    await fc.assert(
      fc.asyncProperty(
        chainLength.chain((length) =>
          fc.tuple(
            fc.constant(length),
            fc.integer({ min: 1, max: length - 1 }),
          ),
        ),
        async ([length, broken]) => {
          const links = await buildChain(length);
          const link = at(links, broken);
          links[broken] = {
            ...link,
            record: { ...link.record, prevHash: "00".repeat(32) },
          };
          expect(verifyChain(links)).toEqual({
            ok: false,
            index: broken,
            reason: "broken-link",
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  it("detects an altered record at the link after it", async () => {
    await fc.assert(
      fc.asyncProperty(
        chainLength.chain((length) =>
          fc.tuple(fc.constant(length), fc.nat({ max: length - 2 })),
        ),
        async ([length, altered]) => {
          const links = await buildChain(length);
          const link = at(links, altered);
          const { carNumber } = link.record;
          const record = {
            ...link.record,
            carNumber: carNumber === 999 ? 1 : carNumber + 1,
          };
          links[altered] = { record, hash: await hashRecord(record) };
          expect(verifyChain(links)).toEqual({
            ok: false,
            index: altered + 1,
            reason: "broken-link",
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  it("detects a record from another device", async () => {
    const links = await buildChain(3);
    const link = at(links, 2);
    links[2] = {
      ...link,
      record: { ...link.record, deviceKeyId: "cd".repeat(32) },
    };
    expect(verifyChain(links)).toEqual({
      ok: false,
      index: 2,
      reason: "wrong-device",
    });
  });

  // A known limit, documented in docs/adr/0002-no-blockchain.md.
  it("cannot tell that the newest records were dropped", async () => {
    const links = await buildChain(5);
    expect(verifyChain(links.slice(0, 3)).ok).toBe(true);
  });
});
