import type { RecordV1 } from "./types";

// Each device keeps one hash chain per rally: records are numbered from 0 by
// `seq`, and each one carries the hash of the record before it. Altering,
// removing or reordering a record breaks the chain after it. Dropping the
// newest records does not, unless the device's latest `seq` is known from
// elsewhere.

/** The last record of a chain that is already trusted (null: none yet). */
export type ChainHead = { seq: number; hash: string } | null;

/** A record and the SHA-256 of its signed payload, as `verifyRecord` returns. */
export type ChainLink = { record: RecordV1; hash: string };

export type ChainFailure =
  | "wrong-device"
  | "gap"
  | "out-of-order"
  | "broken-link";

export type ChainResult =
  | { ok: true; head: ChainHead }
  | { ok: false; index: number; reason: ChainFailure };

/** Where the record after `head` goes in the chain. */
export function nextPosition(head: ChainHead): {
  seq: number;
  prevHash: string | null;
} {
  return head === null
    ? { seq: 0, prevHash: null }
    : { seq: head.seq + 1, prevHash: head.hash };
}

/**
 * Checks that `links`, in the order given, continue the chain from `after`:
 * one device, consecutive `seq`, and each `prevHash` equal to the hash of the
 * record before it. Returns the new head, or the first link that fails.
 */
export function verifyChain(
  links: readonly ChainLink[],
  after: ChainHead = null,
): ChainResult {
  let head = after;
  let deviceKeyId: string | undefined;

  for (const [index, { record, hash }] of links.entries()) {
    deviceKeyId ??= record.deviceKeyId;
    if (record.deviceKeyId !== deviceKeyId) {
      return { ok: false, index, reason: "wrong-device" };
    }

    const expected = nextPosition(head);
    if (record.seq > expected.seq) return { ok: false, index, reason: "gap" };
    if (record.seq < expected.seq) {
      return { ok: false, index, reason: "out-of-order" };
    }
    if (record.prevHash !== expected.prevHash) {
      return { ok: false, index, reason: "broken-link" };
    }

    head = { seq: record.seq, hash };
  }

  return { ok: true, head };
}
