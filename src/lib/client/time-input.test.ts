import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatTime,
  maskTime,
  maxDigits,
  precisionsFor,
  type TimeMode,
  typingHint,
} from "@/lib/client/time-input";
import { PRECISION_UNIT_MS, type Precision } from "@/lib/record/types";

const h = 3_600_000;
const m = 60_000;
const s = 1_000;

describe("maskTime", () => {
  it("fills a time of day from the right as digits are typed", () => {
    const steps = ["", "1", "15", "1506", "150612", "1506124"].map(
      (digits) => maskTime(digits, "time-of-day", "DS").display,
    );
    expect(steps).toEqual([
      "––:––:––,–",
      "––:––:––,1",
      "––:––:–1,5",
      "––:–1:50,6",
      "–1:50:61,2",
      "15:06:12,4",
    ]);
  });

  it.each<[string, TimeMode, Precision, string, number]>([
    [
      "1506124",
      "time-of-day",
      "DS",
      "15:06:12,4",
      15 * h + 6 * m + 12 * s + 400,
    ],
    [
      "0906124",
      "time-of-day",
      "DS",
      "09:06:12,4",
      9 * h + 6 * m + 12 * s + 400,
    ],
    ["1539", "time-of-day", "MIN", "15:39", 15 * h + 39 * m],
    ["0939", "time-of-day", "MIN", "09:39", 9 * h + 39 * m],
    ["150612", "time-of-day", "S", "15:06:12", 15 * h + 6 * m + 12 * s],
    [
      "150612345",
      "time-of-day",
      "MS",
      "15:06:12,345",
      15 * h + 6 * m + 12 * s + 345,
    ],
    ["7069", "elapsed", "DS", "7.06,9", 7 * m + 6 * s + 900],
    ["12069", "elapsed", "DS", "12.06,9", 12 * m + 6 * s + 900],
    ["102034", "elapsed", "DS", "1.02.03,4", h + 2 * m + 3 * s + 400],
    ["706", "elapsed", "S", "7.06", 7 * m + 6 * s],
  ])("reads %s (%s, %s) as %s", (digits, mode, precision, display, ms) => {
    expect(maskTime(digits, mode, precision)).toEqual({
      display,
      value: { ms, precision },
    });
  });

  it("needs both hour digits of a time of day, so a half-typed time never passes", () => {
    // On the way to 15:39, 153 must not be read as 01:53.
    expect(maskTime("153", "time-of-day", "MIN")).toEqual({
      display: "–1:53",
      value: null,
    });
    expect(maskTime("906124", "time-of-day", "DS").value).toBeNull();
  });

  it("shows an elapsed time as typed, without reformatting it", () => {
    expect(maskTime("0706", "elapsed", "S")).toEqual({
      display: "07.06",
      value: { ms: 7 * m + 6 * s, precision: "S" },
    });
  });

  it("has no value until there are enough digits for a whole time", () => {
    expect(maskTime("15061", "time-of-day", "DS").value).toBeNull();
    expect(maskTime("15", "time-of-day", "MIN").value).toBeNull();
    expect(maskTime("706", "elapsed", "DS").value).toBeNull();
  });

  it.each([
    ["1566124", "time-of-day", "DS"],
    ["1506624", "time-of-day", "DS"],
    ["2506124", "time-of-day", "DS"],
    ["1560", "time-of-day", "MIN"],
    ["7669", "elapsed", "DS"],
  ] as const)("has no value for the impossible time %s", (digits, mode, p) => {
    expect(maskTime(digits, mode, p).value).toBeNull();
  });

  it("refuses more digits than the mask holds, or anything but digits", () => {
    expect(() => maskTime("12345", "time-of-day", "MIN")).toThrow(RangeError);
    expect(() => maskTime("15:39", "time-of-day", "MIN")).toThrow(RangeError);
  });

  it("does not offer elapsed times to the minute", () => {
    expect(precisionsFor("elapsed")).not.toContain("MIN");
    expect(() => maskTime("706", "elapsed", "MIN")).toThrow(RangeError);
  });

  it("reads back any time from the digits it is written with", () => {
    const cases = fc
      .constantFrom<TimeMode>("time-of-day", "elapsed")
      .chain((mode) =>
        fc.constantFrom(...precisionsFor(mode)).chain((precision) => {
          const unit = PRECISION_UNIT_MS[precision];
          const limit = mode === "time-of-day" ? 24 * h - 1 : 100 * h - 1;
          return fc
            .nat({ max: Math.floor(limit / unit) })
            .map((units) => ({ mode, precision, ms: units * unit }));
        }),
      );
    fc.assert(
      fc.property(cases, ({ mode, precision, ms }) => {
        const digits = formatTime(ms, mode, precision).replace(/\D/g, "");
        expect(digits.length).toBeLessThanOrEqual(maxDigits(mode, precision));
        expect(maskTime(digits, mode, precision).value).toEqual({
          ms,
          precision,
        });
      }),
    );
  });
});

describe("typingHint", () => {
  it.each<[TimeMode, Precision, string]>([
    ["time-of-day", "MIN", "Type every digit: 0906 for 09:06"],
    ["time-of-day", "S", "Type every digit: 090612 for 09:06:12"],
    ["time-of-day", "DS", "Type every digit: 0906123 for 09:06:12,3"],
    ["time-of-day", "MS", "Type every digit: 090612345 for 09:06:12,345"],
    ["elapsed", "DS", "Type 7069 for 7.06,9"],
    ["elapsed", "S", "Type 706 for 7.06"],
  ])("%s at %s: %s", (mode, precision, hint) => {
    expect(typingHint(mode, precision)).toBe(hint);
  });

  it("gives digits that the mask reads back as the example", () => {
    for (const mode of ["time-of-day", "elapsed"] as const) {
      for (const precision of precisionsFor(mode)) {
        const [, digits = "", reads] =
          /(\d+) for (.+)$/.exec(typingHint(mode, precision)) ?? [];
        expect(maskTime(digits, mode, precision).display).toBe(reads);
      }
    }
  });
});
