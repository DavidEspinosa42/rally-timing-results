import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PRECISION_UNIT_MS,
  PRECISIONS,
  recordV1Schema,
  SOURCE_ROLES,
  SOURCES,
  STAGE_POINTS,
} from "@/lib/record/types";
import {
  IDS,
  penaltyRecord,
  statusRecord,
  timeRecord,
  voidRecord,
} from "../../../test/fixtures";

const accepts = (input: unknown) => recordV1Schema.safeParse(input).success;

/** The fields the issues point at ("" for the record itself). */
const rejectedAt = (input: unknown) =>
  (recordV1Schema.safeParse(input).error?.issues ?? []).map((issue) =>
    issue.path.join("."),
  );

describe("recordV1Schema", () => {
  it.each([
    ["TIME", timeRecord()],
    ["PENALTY", penaltyRecord()],
    ["STATUS", statusRecord()],
    ["VOID", voidRecord()],
  ])("accepts a valid %s record unchanged", (_kind, record) => {
    expect(recordV1Schema.parse(record)).toEqual(record);
  });

  it("rejects unknown fields instead of dropping them", () => {
    expect(rejectedAt({ ...timeRecord(), driverName: "x" })).toEqual([""]);
  });

  it("rejects a record with a field missing", () => {
    const { reason: _, ...missing } = timeRecord();
    expect(accepts(missing)).toBe(false);
  });

  it("rejects another schema version", () => {
    expect(accepts({ ...timeRecord(), schema: "rally-timing/record/v2" })).toBe(
      false,
    );
  });

  it.each([
    [0, false],
    [1, true],
    [999, true],
    [1000, false],
    [8.5, false],
  ])("car number %d accepted: %s", (carNumber, ok) => {
    expect(accepts({ ...timeRecord(), carNumber })).toBe(ok);
  });

  describe("stage XOR control", () => {
    it("rejects both", () => {
      expect(rejectedAt({ ...timeRecord(), controlId: IDS.control })).toEqual([
        "stageId",
      ]);
    });

    it("rejects neither", () => {
      expect(rejectedAt({ ...timeRecord(), stageId: null })).toEqual([
        "stageId",
      ]);
    });

    it("rejects TC on a special stage", () => {
      expect(rejectedAt({ ...timeRecord(), point: "TC" })).toEqual(["point"]);
    });

    it("rejects a stage point on a control", () => {
      const onControl = {
        ...timeRecord(),
        stageId: null,
        controlId: IDS.control,
      };
      expect(rejectedAt({ ...onControl, point: "FINISH" })).toEqual(["point"]);
      expect(
        accepts({
          ...onControl,
          point: "TC",
          timeOfDayMs: 56_340_000,
          precision: "MIN",
        }),
      ).toBe(true);
    });
  });

  describe("TIME", () => {
    it("rejects both time of day and elapsed", () => {
      expect(rejectedAt({ ...timeRecord(), elapsedMs: 426_900 })).toEqual([
        "timeOfDayMs",
      ]);
    });

    it("rejects neither time of day nor elapsed", () => {
      expect(rejectedAt({ ...timeRecord(), timeOfDayMs: null })).toEqual([
        "timeOfDayMs",
      ]);
    });

    it("accepts an elapsed time instead of a time of day", () => {
      expect(
        accepts({ ...timeRecord(), timeOfDayMs: null, elapsedMs: 426_900 }),
      ).toBe(true);
    });

    it("rejects a time of day of 24:00 or later", () => {
      expect(accepts({ ...timeRecord(), timeOfDayMs: 86_400_000 })).toBe(false);
    });

    it("rejects a value with more digits than its precision", () => {
      expect(rejectedAt({ ...timeRecord(), precision: "MIN" })).toEqual([
        "precision",
      ]);
      expect(rejectedAt({ ...timeRecord(), timeOfDayMs: 54_372_450 })).toEqual([
        "precision",
      ]);
    });

    it("rejects a penalty field on a time", () => {
      expect(accepts({ ...timeRecord(), penaltyMs: 10_000 })).toBe(false);
    });
  });

  describe("PENALTY", () => {
    it("rejects a point", () => {
      expect(accepts({ ...penaltyRecord(), point: "TC" })).toBe(false);
    });

    it("rejects a zero penalty", () => {
      expect(accepts({ ...penaltyRecord(), penaltyMs: 0 })).toBe(false);
    });

    it("requires a reason", () => {
      expect(accepts({ ...penaltyRecord(), reason: null })).toBe(false);
    });
  });

  describe("STATUS", () => {
    it("requires elapsedMs for NOTIONAL", () => {
      expect(rejectedAt({ ...statusRecord(), elapsedMs: null })).toEqual([
        "elapsedMs",
      ]);
    });

    it("rejects elapsedMs for any other status", () => {
      expect(rejectedAt({ ...statusRecord(), status: "RET" })).toEqual([
        "elapsedMs",
      ]);
      expect(
        accepts({ ...statusRecord(), status: "RET", elapsedMs: null }),
      ).toBe(true);
    });
  });

  describe("VOID", () => {
    it("rejects a car number", () => {
      expect(accepts({ ...voidRecord(), carNumber: 8 })).toBe(false);
    });

    it("rejects voiding itself", () => {
      expect(rejectedAt({ ...voidRecord(), refRecordId: IDS.record })).toEqual([
        "refRecordId",
      ]);
    });
  });

  describe("chain fields", () => {
    it("requires prevHash after the first record", () => {
      expect(rejectedAt({ ...timeRecord(), seq: 1 })).toEqual(["prevHash"]);
      expect(
        accepts({ ...timeRecord(), seq: 1, prevHash: "cd".repeat(32) }),
      ).toBe(true);
    });

    it("rejects prevHash on the first record", () => {
      expect(
        rejectedAt({ ...timeRecord(), prevHash: "cd".repeat(32) }),
      ).toEqual(["prevHash"]);
    });

    it("rejects an uppercase or short hash", () => {
      const at = (prevHash: string) => ({ ...timeRecord(), seq: 1, prevHash });
      expect(accepts(at("CD".repeat(32)))).toBe(false);
      expect(accepts(at("cd".repeat(31)))).toBe(false);
    });
  });

  it("accepts any well-formed stage time", () => {
    const stageTime = fc
      .record({
        point: fc.constantFrom(...STAGE_POINTS),
        carNumber: fc.integer({ min: 1, max: 999 }),
        precision: fc.constantFrom(...PRECISIONS),
        source: fc.constantFrom(...SOURCES),
        sourceRole: fc.constantFrom(...SOURCE_ROLES),
        units: fc.nat(),
      })
      .map(({ units, ...fields }) => {
        const unit = PRECISION_UNIT_MS[fields.precision];
        const timeOfDayMs = (units % Math.floor(86_400_000 / unit)) * unit;
        return { ...timeRecord(), ...fields, timeOfDayMs };
      });

    fc.assert(
      fc.property(stageTime, (record) => {
        expect(recordV1Schema.parse(record)).toEqual(record);
      }),
    );
  });
});
