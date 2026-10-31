import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { parseCanonical } from "@/lib/record/canonical";
import {
  type ChainFailure,
  type ChainHead,
  verifyChain,
} from "@/lib/record/chain";
import { fromHex } from "@/lib/record/hash";
import {
  type SignedRecord,
  type VerifyFailure,
  verifyRecord,
} from "@/lib/record/sign";
import type { RecordV1 } from "@/lib/record/types";
import {
  controls,
  deviceGrants,
  devices,
  legs,
  records,
  sections,
  stages,
} from "./db/schema";

// Small batches keep one request from holding PGlite's single backend for
// long. A v1 payload is about 700 characters; the caps leave ample room.
export const MAX_BATCH_RECORDS = 500;
const MAX_PAYLOAD_CHARS = 2_048;
export const MAX_BODY_BYTES = 1_500_000;

const signedRecordSchema = z.strictObject({
  payload: z.string().max(MAX_PAYLOAD_CHARS),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().regex(/^[0-9a-f]{128}$/),
});

export const syncRequestSchema = z.strictObject({
  records: z.array(signedRecordSchema).min(1).max(MAX_BATCH_RECORDS),
});

export type RejectReason =
  | VerifyFailure
  | ChainFailure
  | "unknown-device"
  | "revoked"
  | "wrong-rally"
  | "not-authorized"
  | "conflict";

export type Rejection = {
  index: number;
  recordId: string | null;
  reason: RejectReason;
};

/**
 * The batch is processed in order and stops at the first record that fails:
 * `accepted` records (the ones before it) are stored, including any that
 * were already stored. The device keeps the rest and may resend them.
 */
export type SyncResult = {
  accepted: number;
  head: ChainHead;
  rejected: Rejection | null;
};

type Verified = { record: RecordV1; signed: SignedRecord; hash: string };
type Db = NodePgDatabase;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function importPublicKey(hex: string): Promise<CryptoKey> {
  const raw = fromHex(hex);
  if (raw === null) throw new Error("stored public key is not hex");
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, true, [
    "verify",
  ]);
}

async function loadGrants(tx: Tx, deviceKeyId: string) {
  return tx
    .select({
      stageId: deviceGrants.stageId,
      controlId: deviceGrants.controlId,
      point: deviceGrants.point,
      sectionId: sections.id,
      rallyId: legs.rallyId,
    })
    .from(deviceGrants)
    .leftJoin(stages, eq(deviceGrants.stageId, stages.id))
    .leftJoin(controls, eq(deviceGrants.controlId, controls.id))
    .leftJoin(
      sections,
      eq(
        sections.id,
        sql`coalesce(${stages.sectionId}, ${controls.sectionId})`,
      ),
    )
    .leftJoin(legs, eq(sections.legId, legs.id))
    .where(eq(deviceGrants.deviceKeyId, deviceKeyId));
}

type Grant = Awaited<ReturnType<typeof loadGrants>>[number];

/**
 * A device may send any record about a stage or control it holds a grant
 * for, in that target's section and rally; a TIME also needs a grant for
 * its point.
 */
function isAuthorized(record: RecordV1, grants: readonly Grant[]): boolean {
  const onTarget = grants.filter(
    (grant) =>
      grant.stageId === record.stageId &&
      grant.controlId === record.controlId &&
      grant.sectionId === record.sectionId &&
      grant.rallyId === record.rallyId,
  );
  if (record.kind === "TIME") {
    return onTarget.some((grant) => grant.point === record.point);
  }
  return onTarget.length > 0;
}

function toRow({ record, signed, hash }: Verified) {
  return {
    recordId: record.recordId,
    deviceKeyId: record.deviceKeyId,
    seq: record.seq,
    prevHash: record.prevHash,
    payload: signed.payload,
    hash,
    signature: signed.signature,
    rallyId: record.rallyId,
    sectionId: record.sectionId,
    stageId: record.stageId,
    controlId: record.controlId,
    kind: record.kind,
    point: record.point,
    carNumber: record.carNumber,
    timeOfDayMs: record.timeOfDayMs,
    elapsedMs: record.elapsedMs,
    precision: record.precision,
    source: record.source,
    sourceRole: record.sourceRole,
    refRecordId: record.refRecordId,
    penaltyMs: record.penaltyMs,
    status: record.status,
    reason: record.reason,
    enteredAtMs: record.enteredAtMs,
  };
}

/**
 * Verifies a batch from one device and stores what passes, in order:
 * signature, device authorization, then chain. Inserts are idempotent.
 */
export async function storeBatch(
  db: Db,
  batch: readonly SignedRecord[],
): Promise<SyncResult> {
  // The batch's device is the one the first record names; a record naming
  // another device then fails its signature check against this key.
  const first = batch[0];
  const claimed = first === undefined ? null : parseCanonical(first.payload);
  if (claimed === null) return reject(null, 0, null, "not-canonical");
  const keyId = claimed.deviceKeyId;
  if (typeof keyId !== "string") {
    return reject(null, 0, recordIdOf(first), "invalid-record");
  }
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.keyId, keyId));
  if (device === undefined) {
    return reject(null, 0, recordIdOf(first), "unknown-device");
  }

  // Signatures first, outside any transaction: this is the CPU-heavy part.
  const publicKey = await importPublicKey(device.publicKey);
  const verified: Verified[] = [];
  let signatureFailure: Rejection | null = null;
  for (const [index, signed] of batch.entries()) {
    const result = await verifyRecord(signed, publicKey);
    if (!result.ok) {
      signatureFailure = {
        index,
        recordId: recordIdOf(signed),
        reason: result.reason,
      };
      break;
    }
    verified.push({ record: result.record, signed, hash: result.hash });
  }

  return db.transaction(async (tx) => {
    // Locking the device serializes concurrent batches from it, so the chain
    // head read below cannot change before the insert.
    const [locked] = await tx
      .select({ revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.keyId, device.keyId))
      .for("update");
    const [last] = await tx
      .select({ seq: records.seq, hash: records.hash })
      .from(records)
      .where(eq(records.deviceKeyId, device.keyId))
      .orderBy(desc(records.seq))
      .limit(1);
    let head: ChainHead = last ?? null;

    if (locked === undefined || locked.revokedAt !== null) {
      return reject(head, 0, recordIdOf(batch[0]), "revoked");
    }

    const grants = await loadGrants(tx, device.keyId);
    const ids = verified.map(({ record }) => record.recordId);
    const stored = new Map(
      ids.length === 0
        ? []
        : (
            await tx
              .select({ recordId: records.recordId, hash: records.hash })
              .from(records)
              .where(inArray(records.recordId, ids))
          ).map((row) => [row.recordId, row.hash]),
    );

    const fresh: Verified[] = [];
    let rejected: Rejection | null = null;
    for (const [index, item] of verified.entries()) {
      const { record, hash } = item;
      const storedHash = stored.get(record.recordId);
      let reason: RejectReason;
      if (record.rallyId !== device.rallyId) {
        reason = "wrong-rally";
      } else if (!isAuthorized(record, grants)) {
        reason = "not-authorized";
      } else if (storedHash === hash) {
        // A resend after a partial sync: already stored, nothing to do.
        continue;
      } else if (storedHash !== undefined) {
        reason = "conflict";
      } else {
        const chain = verifyChain([{ record, hash }], head);
        if (chain.ok) {
          head = chain.head;
          fresh.push(item);
          continue;
        }
        reason = chain.reason;
      }
      rejected = { index, recordId: record.recordId, reason };
      break;
    }

    if (fresh.length > 0) {
      await tx
        .insert(records)
        .values(fresh.map(toRow))
        .onConflictDoNothing({ target: records.recordId });
    }

    const failure: Rejection | null = rejected ?? signatureFailure;
    return {
      accepted: failure === null ? batch.length : failure.index,
      head,
      rejected: failure,
    };
  });
}

function recordIdOf(signed: SignedRecord | undefined): string | null {
  if (signed === undefined) return null;
  const id = parseCanonical(signed.payload)?.recordId;
  return typeof id === "string" ? id : null;
}

function reject(
  head: ChainHead,
  index: number,
  recordId: string | null,
  reason: RejectReason,
): SyncResult {
  return { accepted: index, head, rejected: { index, recordId, reason } };
}
