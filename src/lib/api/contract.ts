import { z } from "zod";
import { CONTROL_KINDS, POINTS } from "@/lib/record/types";

// Response bodies of the read endpoints. The server builds them; the client
// parses every response with these schemas before trusting it.

export const rallySummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
});
export type RallySummary = z.infer<typeof rallySummarySchema>;

/** GET /api/rallies */
export const ralliesResponseSchema = z.array(rallySummarySchema);

const stageTargetSchema = z.strictObject({
  kind: z.literal("stage"),
  stageId: z.uuid(),
  number: z.int().min(0),
  name: z.string(),
  // False for a shakedown.
  scoring: z.boolean(),
  isPowerStage: z.boolean(),
});

const controlTargetSchema = z.strictObject({
  kind: z.literal("control"),
  controlId: z.uuid(),
  code: z.string(),
  controlKind: z.enum(CONTROL_KINDS),
});

/** One point the device may enter on one stage or control. */
export const grantSchema = z.strictObject({
  sectionId: z.uuid(),
  point: z.enum(POINTS),
  target: z.discriminatedUnion("kind", [
    stageTargetSchema,
    controlTargetSchema,
  ]),
});
export type Grant = z.infer<typeof grantSchema>;

/** GET /api/devices/[keyId], once the device is authorized. */
export const deviceInfoSchema = z.strictObject({
  keyId: z.string().regex(/^[0-9a-f]{64}$/),
  rallyId: z.uuid(),
  revoked: z.boolean(),
  // In itinerary order.
  grants: z.array(grantSchema),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

/** The most records one POST /api/sync may carry. */
export const MAX_BATCH_RECORDS = 500;

/** Why the server stopped storing a batch at a record. */
export const REJECT_REASONS = [
  // The record itself (signature and format).
  "not-canonical",
  "invalid-record",
  "key-mismatch",
  "bad-signature",
  "hash-mismatch",
  // Its place in the device's chain.
  "wrong-device",
  "gap",
  "out-of-order",
  "broken-link",
  // The device and what it may enter.
  "unknown-device",
  "revoked",
  "wrong-rally",
  "not-authorized",
  // A stored record id that came back with other content.
  "conflict",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const rejectionSchema = z.strictObject({
  index: z.int().min(0),
  // As the record claimed it; null when the payload could not be read.
  recordId: z.string().nullable(),
  reason: z.enum(REJECT_REASONS),
});
export type Rejection = z.infer<typeof rejectionSchema>;

/**
 * POST /api/sync. The batch is processed in order and stops at the first
 * record that fails: `accepted` records (the ones before it) are stored,
 * including any that were already stored. `head` is the last record the
 * server holds for the device, whatever this batch contained.
 */
export const syncResultSchema = z.strictObject({
  accepted: z.int().min(0),
  head: z
    .strictObject({
      seq: z.int().min(0),
      hash: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .nullable(),
  rejected: rejectionSchema.nullable(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;
