import { describe, expect, it } from "vitest";
import type { Grant } from "@/lib/api/contract";
import {
  defaultSource,
  grantKey,
  grantLabel,
  grantOf,
} from "@/lib/client/labels";
import { IDS, penaltyRecord, timeRecord } from "../../../test/fixtures";

const stage = (
  point: Grant["point"],
  extra: { number?: number; scoring?: boolean; isPowerStage?: boolean } = {},
): Grant => ({
  sectionId: IDS.section,
  point,
  target: {
    kind: "stage",
    stageId: IDS.stage,
    number: extra.number ?? 1,
    name: "Stage",
    scoring: extra.scoring ?? true,
    isPowerStage: extra.isPowerStage ?? false,
  },
});

const control = (
  code: string,
  controlKind: "TC" | "REGROUP_IN" = "TC",
): Grant => ({
  sectionId: IDS.section,
  point: "TC",
  target: { kind: "control", controlId: IDS.control, code, controlKind },
});

describe("grantLabel", () => {
  it.each<[Grant, string]>([
    [stage("FINISH"), "SS1 Finish"],
    [stage("START", { number: 0, scoring: false }), "SS0 Start, shakedown"],
    [
      stage("FINISH", { number: 7, isPowerStage: true }),
      "SS7 Finish, Power Stage",
    ],
    [control("4"), "TC 4"],
    [control("2A", "REGROUP_IN"), "TC 2A Regroup in"],
  ])("names %j as %s", (grant, label) => {
    expect(grantLabel(grant)).toBe(label);
  });
});

describe("grantKey", () => {
  it("tells apart two points on the same stage", () => {
    expect(grantKey(stage("START"))).not.toBe(grantKey(stage("FINISH")));
  });
});

describe("grantOf", () => {
  const grants = [stage("START"), stage("FINISH"), control("1")];

  it("finds the grant a time was entered under", () => {
    expect(grantOf(timeRecord(), grants)).toBe(grants[1]);
  });

  it("finds the control of a penalty", () => {
    expect(grantOf(penaltyRecord(), grants)).toBe(grants[2]);
  });

  it("is undefined for a target the device no longer holds", () => {
    expect(grantOf(timeRecord(), [control("1")])).toBeUndefined();
  });
});

describe("defaultSource", () => {
  it("is the photocell printer on a stage and the clock at a control", () => {
    expect(defaultSource(stage("FINISH"))).toBe("PHOTOCELL_PRINTER");
    expect(defaultSource(control("1"))).toBe("CLOCK");
  });
});
