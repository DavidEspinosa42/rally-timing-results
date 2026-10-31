import "client-only";
import type { Grant } from "@/lib/api/contract";
import type {
  ControlKind,
  Point,
  RecordV1,
  Source,
  SourceRole,
} from "@/lib/record/types";

// Names as a marshal says them, in one place so every screen agrees.

const POINT_NAMES: Readonly<Record<Point, string>> = {
  START: "Start",
  FINISH: "Finish",
  SPLIT: "Split",
  STOP: "Stop",
  TC: "Time control",
};

const CONTROL_KIND_NAMES: Readonly<Record<ControlKind, string | null>> = {
  TC: null,
  SERVICE_IN: "Service in",
  SERVICE_OUT: "Service out",
  PARC_FERME_IN: "Parc fermé in",
  PARC_FERME_OUT: "Parc fermé out",
  REGROUP_IN: "Regroup in",
  REGROUP_OUT: "Regroup out",
  TECH_ZONE: "Technical zone",
};

export const SOURCE_NAMES: Readonly<Record<Source, string>> = {
  PHOTOCELL_PRINTER: "Photocell printer",
  STOPWATCH: "Stopwatch",
  CLOCK: "Clock",
  TRANSPONDER: "Transponder",
  OTHER: "Other",
};

export const ROLE_NAMES: Readonly<Record<SourceRole, string>> = {
  PRIMARY: "Primary",
  BACKUP: "Backup",
};

/** "SS1 Finish", "SS7 Finish, Power Stage", "TC 2A Regroup in". */
export function grantLabel({ target, point }: Grant): string {
  if (target.kind === "stage") {
    const base = `SS${target.number} ${POINT_NAMES[point]}`;
    if (!target.scoring) return `${base}, shakedown`;
    return target.isPowerStage ? `${base}, Power Stage` : base;
  }
  const kind = CONTROL_KIND_NAMES[target.controlKind];
  return kind === null ? `TC ${target.code}` : `TC ${target.code} ${kind}`;
}

/** A stable value for a grant, for form controls and keys. */
export function grantKey({ target, point }: Grant): string {
  const id = target.kind === "stage" ? target.stageId : target.controlId;
  return `${id}:${point}`;
}

/** The grant a stored record was entered under, if the device still holds it. */
export function grantOf(
  record: RecordV1,
  grants: readonly Grant[],
): Grant | undefined {
  return grants.find(({ target, point }) =>
    target.kind === "stage"
      ? target.stageId === record.stageId &&
        (record.point === null || record.point === point)
      : target.controlId === record.controlId,
  );
}

/** What a timing source at this kind of point usually is. */
export function defaultSource(grant: Grant): Source {
  return grant.target.kind === "stage" ? "PHOTOCELL_PRINTER" : "CLOCK";
}
