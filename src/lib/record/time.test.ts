import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  defaultPrecision,
  formatElapsed,
  formatTimeOfDay,
  parseElapsed,
  parseTimeOfDay,
} from "@/lib/record/time";
import { PRECISION_UNIT_MS, type Precision } from "@/lib/record/types";

const h = 3_600_000;
const m = 60_000;
const s = 1_000;

describe("parseTimeOfDay", () => {
  it.each<[string, number, Precision]>([
    ["15:39", 15 * h + 39 * m, "MIN"],
    ["9:05", 9 * h + 5 * m, "MIN"],
    ["15:06:12", 15 * h + 6 * m + 12 * s, "S"],
    ["15:06:12,4", 15 * h + 6 * m + 12 * s + 400, "DS"],
    ["15:06:12.4", 15 * h + 6 * m + 12 * s + 400, "DS"],
    ["15.06.12,4", 15 * h + 6 * m + 12 * s + 400, "DS"],
    ["15:06:12,45", 15 * h + 6 * m + 12 * s + 450, "CS"],
    ["07:05:03.123", 7 * h + 5 * m + 3 * s + 123, "MS"],
    ["00:00", 0, "MIN"],
    ["23:59:59,9", 23 * h + 59 * m + 59 * s + 900, "DS"],
    [" 15:39 ", 15 * h + 39 * m, "MIN"],
  ])("%s", (input, ms, precision) => {
    expect(parseTimeOfDay(input)).toEqual({ ms, precision });
  });

  it.each([
    "",
    "abc",
    "24:00",
    "15:60",
    "15:06:60",
    "15:6",
    "15.39",
    "15.06.12.4",
    "15:06:12,4567",
    "-1:00",
  ])("rejects %j", (input) => {
    expect(parseTimeOfDay(input)).toBeNull();
  });
});

describe("parseElapsed", () => {
  it.each<[string, number, Precision]>([
    ["7.06,9", 7 * m + 6 * s + 900, "DS"],
    ["12.06,9", 12 * m + 6 * s + 900, "DS"],
    ["1.10,0", 1 * m + 10 * s, "DS"],
    [".30,0", 30 * s, "DS"],
    ["0.30,0", 30 * s, "DS"],
    ["7.06", 7 * m + 6 * s, "S"],
    ["1.02.03,4", 1 * h + 2 * m + 3 * s + 400, "DS"],
    ["7:06.9", 7 * m + 6 * s + 900, "DS"],
    ["7:06,9", 7 * m + 6 * s + 900, "DS"],
    ["1:02:03.456", 1 * h + 2 * m + 3 * s + 456, "MS"],
    ["125:30", 125 * m + 30 * s, "S"],
  ])("%s", (input, ms, precision) => {
    expect(parseElapsed(input)).toEqual({ ms, precision });
  });

  it.each([
    "",
    "7",
    "7.6,9",
    "7.60,0",
    "1.60.00,0",
    "7.06.9",
    "7,06",
    "7.06,9999",
    "7:06:9",
  ])("rejects %j", (input) => {
    expect(parseElapsed(input)).toBeNull();
  });
});

describe("formatTimeOfDay", () => {
  it.each<[number, Precision, string]>([
    [15 * h + 39 * m, "MIN", "15:39"],
    [15 * h + 6 * m + 12 * s, "S", "15:06:12"],
    [15 * h + 6 * m + 12 * s + 400, "DS", "15:06:12,4"],
    [9 * h + 5 * m + 3 * s + 50, "CS", "09:05:03,05"],
    [9 * h + 5 * m + 3 * s + 7, "MS", "09:05:03,007"],
  ])("%d ms at %s → %s", (ms, precision, text) => {
    expect(formatTimeOfDay(ms, precision)).toBe(text);
  });

  it("refuses a value with more digits than the precision", () => {
    expect(() => formatTimeOfDay(15 * h + 39 * m + 1, "MIN")).toThrow(
      RangeError,
    );
  });

  it("refuses 24:00", () => {
    expect(() => formatTimeOfDay(24 * h, "MIN")).toThrow(RangeError);
  });
});

describe("formatElapsed", () => {
  it.each<[number, Precision, string]>([
    [7 * m + 6 * s + 900, "DS", "7.06,9"],
    [12 * m + 6 * s + 900, "DS", "12.06,9"],
    [30 * s, "DS", "0.30,0"],
    [1 * h + 2 * m + 3 * s + 400, "DS", "1.02.03,4"],
    [7 * m + 6 * s, "S", "7.06"],
    [7 * m, "MIN", "7.00"],
  ])("%d ms at %s → %s", (ms, precision, text) => {
    expect(formatElapsed(ms, precision)).toBe(text);
  });

  it("refuses a negative or fractional value", () => {
    expect(() => formatElapsed(-100, "DS")).toThrow(RangeError);
    expect(() => formatElapsed(0.5, "MS")).toThrow(RangeError);
  });
});

describe("round trips", () => {
  const writtenWithSeconds = fc.constantFrom<Precision>("S", "DS", "CS", "MS");
  const multiple = (precision: Precision, max: number) =>
    fc
      .nat({ max: Math.floor(max / PRECISION_UNIT_MS[precision]) })
      .map((units) => units * PRECISION_UNIT_MS[precision]);

  it("parses back any formatted time of day", () => {
    const precision = fc.constantFrom<Precision>("MIN", "S", "DS", "CS", "MS");
    fc.assert(
      fc.property(
        precision.chain((p) =>
          multiple(p, 86_400_000 - 1).map((ms) => ({ ms, p })),
        ),
        ({ ms, p }) => {
          expect(parseTimeOfDay(formatTimeOfDay(ms, p))).toEqual({
            ms,
            precision: p,
          });
        },
      ),
    );
  });

  it("parses back any formatted elapsed time", () => {
    fc.assert(
      fc.property(
        writtenWithSeconds.chain((p) =>
          multiple(p, 100 * h - 1).map((ms) => ({ ms, p })),
        ),
        ({ ms, p }) => {
          expect(parseElapsed(formatElapsed(ms, p))).toEqual({
            ms,
            precision: p,
          });
        },
      ),
    );
  });
});

describe("defaultPrecision", () => {
  it("is to the minute at a time control", () => {
    expect(defaultPrecision("TC")).toBe("MIN");
  });

  it("is to the tenth on a special stage", () => {
    expect(defaultPrecision("START")).toBe("DS");
    expect(defaultPrecision("FINISH")).toBe("DS");
  });

  it("is to the thousandth in practice", () => {
    expect(defaultPrecision("FINISH", { practice: true })).toBe("MS");
  });
});
