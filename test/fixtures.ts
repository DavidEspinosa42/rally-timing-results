import {
  type PenaltyRecord,
  RECORD_SCHEMA_V1,
  type StatusRecord,
  type TimeRecord,
  type VoidRecord,
} from "@/lib/record/types";

// Dummy identifiers only; no real rally or device.
export const IDS = {
  rally: "00000000-0000-4000-8000-000000000001",
  section: "00000000-0000-4000-8000-000000000002",
  stage: "00000000-0000-4000-8000-000000000003",
  control: "00000000-0000-4000-8000-000000000004",
  record: "00000000-0000-4000-8000-000000000010",
  otherRecord: "00000000-0000-4000-8000-000000000011",
} as const;

export const DEVICE_KEY_ID = "ab".repeat(32);

const common = {
  schema: RECORD_SCHEMA_V1,
  recordId: IDS.record,
  deviceKeyId: DEVICE_KEY_ID,
  rallyId: IDS.rally,
  sectionId: IDS.section,
  seq: 0,
  prevHash: null,
  enteredAtMs: 1_790_000_000_000,
} as const;

/** A FINISH at 15:06:12,4 on a special stage. */
export function timeRecord(): TimeRecord {
  return {
    ...common,
    stageId: IDS.stage,
    controlId: null,
    kind: "TIME",
    point: "FINISH",
    carNumber: 8,
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
}

/** 10 s for arriving late at a time control. */
export function penaltyRecord(): PenaltyRecord {
  return {
    ...common,
    stageId: null,
    controlId: IDS.control,
    kind: "PENALTY",
    point: null,
    carNumber: 8,
    timeOfDayMs: null,
    elapsedMs: null,
    precision: null,
    source: null,
    sourceRole: null,
    refRecordId: null,
    penaltyMs: 10_000,
    status: null,
    reason: "TC_LATE",
  };
}

/** A notional stage time after the stage was interrupted. */
export function statusRecord(): StatusRecord {
  return {
    ...common,
    stageId: IDS.stage,
    controlId: null,
    kind: "STATUS",
    point: null,
    carNumber: 8,
    timeOfDayMs: null,
    elapsedMs: 426_900,
    precision: null,
    source: null,
    sourceRole: null,
    refRecordId: null,
    penaltyMs: null,
    status: "NOTIONAL",
    reason: null,
  };
}

export function voidRecord(): VoidRecord {
  return {
    ...common,
    stageId: IDS.stage,
    controlId: null,
    kind: "VOID",
    point: null,
    carNumber: null,
    timeOfDayMs: null,
    elapsedMs: null,
    precision: null,
    source: null,
    sourceRole: null,
    refRecordId: IDS.otherRecord,
    penaltyMs: null,
    status: null,
    reason: null,
  };
}
