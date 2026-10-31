import { z } from "zod";

// Domain separation: the signature covers this string, so a v1 signature can
// never be replayed as a record of another schema version.
export const RECORD_SCHEMA_V1 = "rally-timing/record/v1";

export const RECORD_KINDS = ["TIME", "PENALTY", "STATUS", "VOID"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const STAGE_POINTS = ["START", "FINISH", "SPLIT", "STOP"] as const;
export type StagePoint = (typeof STAGE_POINTS)[number];

// Every control is a time control; what it means comes from `controls.kind`.
export const CONTROL_POINTS = ["TC"] as const;
export type ControlPoint = (typeof CONTROL_POINTS)[number];

export const POINTS = [...STAGE_POINTS, ...CONTROL_POINTS] as const;
export type Point = (typeof POINTS)[number];

export const PRECISIONS = ["MIN", "S", "DS", "CS", "MS"] as const;
export type Precision = (typeof PRECISIONS)[number];

export const PRECISION_UNIT_MS: Readonly<Record<Precision, number>> = {
  MIN: 60_000,
  S: 1_000,
  DS: 100,
  CS: 10,
  MS: 1,
};

export const SOURCES = [
  "PHOTOCELL_PRINTER",
  "STOPWATCH",
  "CLOCK",
  "TRANSPONDER",
  "OTHER",
] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_ROLES = ["PRIMARY", "BACKUP"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const STATUSES = [
  "DNS",
  "RET",
  "RET_FINAL",
  "RESTART",
  "DSQ",
  "NOTIONAL",
] as const;
export type Status = (typeof STATUSES)[number];

export const PENALTY_REASONS = [
  "TC_LATE",
  "TC_EARLY",
  "FALSE_START",
  "LATE_START",
  "CHICANE",
  "ROUTE",
  "RESTART",
  "ENGINE_CHANGE",
  "OTHER",
] as const;
export type PenaltyReason = (typeof PENALTY_REASONS)[number];

// What a time control is (controls.kind in the database). Not a field of
// signed records: a record at a control always has the TC point.
export const CONTROL_KINDS = [
  "TC",
  "SERVICE_IN",
  "SERVICE_OUT",
  "PARC_FERME_IN",
  "PARC_FERME_OUT",
  "REGROUP_IN",
  "REGROUP_OUT",
  "TECH_ZONE",
] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

export const MIN_CAR_NUMBER = 1;
export const MAX_CAR_NUMBER = 999;
export const DAY_MS = 86_400_000;

const id = z.uuid();
// Lowercase hex SHA-256: `deviceKeyId` is the hash of the raw public key,
// `prevHash` the hash of the previous record in the device's chain.
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const carNumber = z.int().min(MIN_CAR_NUMBER).max(MAX_CAR_NUMBER);
// Milliseconds since local midnight of the section's date, in the rally's
// time zone. Crossing midnight is resolved by the results, not here.
const timeOfDayMs = z
  .int()
  .min(0)
  .max(DAY_MS - 1);
const elapsedMs = z.int().min(0);
const none = z.null();

const base = {
  schema: z.literal(RECORD_SCHEMA_V1),
  recordId: id,
  deviceKeyId: sha256Hex,
  rallyId: id,
  sectionId: id,
  stageId: id.nullable(),
  controlId: id.nullable(),
  seq: z.int().min(0),
  prevHash: sha256Hex.nullable(),
  // Unix epoch ms from the device clock: when the entry was made, for audit
  // only. It never measures anything.
  enteredAtMs: z.int().min(0),
};

// Every field is present in every kind, so the canonical form has one shape.
const timeRecord = z.strictObject({
  ...base,
  kind: z.literal("TIME"),
  point: z.enum(POINTS),
  carNumber,
  timeOfDayMs: timeOfDayMs.nullable(),
  elapsedMs: elapsedMs.nullable(),
  precision: z.enum(PRECISIONS),
  source: z.enum(SOURCES),
  sourceRole: z.enum(SOURCE_ROLES),
  refRecordId: none,
  penaltyMs: none,
  status: none,
  reason: none,
});

const penaltyRecord = z.strictObject({
  ...base,
  kind: z.literal("PENALTY"),
  point: none,
  carNumber,
  timeOfDayMs: none,
  elapsedMs: none,
  precision: none,
  source: none,
  sourceRole: none,
  refRecordId: none,
  penaltyMs: z.int().min(1),
  status: none,
  reason: z.enum(PENALTY_REASONS),
});

const statusRecord = z.strictObject({
  ...base,
  kind: z.literal("STATUS"),
  point: none,
  carNumber,
  timeOfDayMs: none,
  // Only a NOTIONAL status carries a time (checked below).
  elapsedMs: elapsedMs.nullable(),
  precision: none,
  source: none,
  sourceRole: none,
  refRecordId: none,
  penaltyMs: none,
  status: z.enum(STATUSES),
  reason: none,
});

const voidRecord = z.strictObject({
  ...base,
  kind: z.literal("VOID"),
  point: none,
  carNumber: none,
  timeOfDayMs: none,
  elapsedMs: none,
  precision: none,
  source: none,
  sourceRole: none,
  refRecordId: id,
  penaltyMs: none,
  status: none,
  reason: none,
});

export const recordV1Schema = z
  .discriminatedUnion("kind", [
    timeRecord,
    penaltyRecord,
    statusRecord,
    voidRecord,
  ])
  .superRefine((record, ctx) => {
    const fail = (field: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message, input: record });

    const oneTarget = (record.stageId === null) !== (record.controlId === null);
    if (!oneTarget) {
      fail("stageId", "exactly one of stageId and controlId must be set");
    }
    if ((record.prevHash === null) !== (record.seq === 0)) {
      fail("prevHash", "prevHash is null exactly when seq is 0");
    }

    switch (record.kind) {
      case "TIME": {
        const onControl = record.controlId !== null;
        if (oneTarget && onControl !== (record.point === "TC")) {
          fail(
            "point",
            onControl
              ? "a control only takes the TC point"
              : "a special stage takes START, FINISH, SPLIT or STOP",
          );
        }
        const value = record.timeOfDayMs ?? record.elapsedMs;
        if (
          value === null ||
          (record.timeOfDayMs !== null && record.elapsedMs !== null)
        ) {
          fail(
            "timeOfDayMs",
            "exactly one of timeOfDayMs and elapsedMs must be set",
          );
        } else if (value % PRECISION_UNIT_MS[record.precision] !== 0) {
          fail("precision", "the time has more digits than its precision");
        }
        break;
      }
      case "STATUS":
        if ((record.status === "NOTIONAL") !== (record.elapsedMs !== null)) {
          fail("elapsedMs", "elapsedMs is set exactly when status is NOTIONAL");
        }
        break;
      case "VOID":
        if (record.refRecordId === record.recordId) {
          fail("refRecordId", "a record cannot void itself");
        }
        break;
      case "PENALTY":
        break;
    }
  });

export type RecordV1 = z.infer<typeof recordV1Schema>;
export type TimeRecord = Extract<RecordV1, { kind: "TIME" }>;
export type PenaltyRecord = Extract<RecordV1, { kind: "PENALTY" }>;
export type StatusRecord = Extract<RecordV1, { kind: "STATUS" }>;
export type VoidRecord = Extract<RecordV1, { kind: "VOID" }>;
