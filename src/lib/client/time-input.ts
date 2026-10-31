import "client-only";
import {
  formatElapsed,
  formatTimeOfDay,
  type ParsedTime,
  parseElapsed,
  parseTimeOfDay,
} from "@/lib/record/time";
import { PRECISION_UNIT_MS, type Precision } from "@/lib/record/types";

// The marshal types digits only. They fill the time from the right, the way
// a printed reading is copied, and the separators come from the mask:
// 1506124 → 15:06:12,4 (to the tenth), 7069 → 7.06,9 (elapsed). The text the
// mask builds goes through the record parsers, so validation lives in one
// place.

export type TimeMode = "time-of-day" | "elapsed";

const FRACTION_DIGITS: Readonly<Record<Precision, number>> = {
  MIN: 0,
  S: 0,
  DS: 1,
  CS: 2,
  MS: 3,
};

/** An elapsed time is never written to the minute. */
export function precisionsFor(mode: TimeMode): readonly Precision[] {
  return mode === "time-of-day"
    ? ["MIN", "S", "DS", "CS", "MS"]
    : ["S", "DS", "CS", "MS"];
}

/** Hours, minutes, seconds (unless to the minute), then the fraction. */
export function maxDigits(mode: TimeMode, precision: Precision): number {
  if (mode === "time-of-day" && precision === "MIN") return 4;
  return 6 + FRACTION_DIGITS[precision];
}

/**
 * The fewest digits that make a whole time. A time of day needs every digit,
 * both hour digits included (0905, not 905), so a half-typed time is never
 * mistaken for a whole one: 153 must not pass as 01:53 on the way to 15:39.
 * Elapsed minutes vary in width (7.06,9 and 12.06,9), so m.ss is enough.
 */
function minDigits(mode: TimeMode, precision: Precision): number {
  if (mode === "time-of-day") return maxDigits(mode, precision);
  return 3 + FRACTION_DIGITS[precision];
}

function template(mode: TimeMode, precision: Precision, typed: number): string {
  const fraction = "–".repeat(FRACTION_DIGITS[precision]);
  const tail = fraction === "" ? "" : `,${fraction}`;
  if (mode === "time-of-day") {
    return precision === "MIN" ? "––:––" : `––:––:––${tail}`;
  }
  // Elapsed times grow an hours group only once there are digits for it.
  return typed > 4 + FRACTION_DIGITS[precision]
    ? `––.––.––${tail}`
    : `––.––${tail}`;
}

/** Puts the digits into the mask's slots, filling from the right. */
function fill(mask: string, digits: string): string {
  const out = mask.split("");
  let next = digits.length - 1;
  for (let i = out.length - 1; i >= 0 && next >= 0; i--) {
    if (out[i] === "–") out[i] = digits.charAt(next--);
  }
  return out.join("");
}

export type MaskedTime = {
  /** Exactly what was typed, in the mask. */
  display: string;
  /** The parsed value, or null until the digits make a valid time. */
  value: ParsedTime | null;
};

export function maskTime(
  digits: string,
  mode: TimeMode,
  precision: Precision,
): MaskedTime {
  if (!/^\d*$/.test(digits) || digits.length > maxDigits(mode, precision)) {
    throw new RangeError(`not a digit string for this mask: ${digits}`);
  }
  if (!precisionsFor(mode).includes(precision)) {
    throw new RangeError(`no ${precision} precision for ${mode}`);
  }

  const shown = fill(template(mode, precision, digits.length), digits);
  if (digits.length < minDigits(mode, precision)) {
    return { display: shown, value: null };
  }

  const text = shown.replace(/^[–.:]+/, "");
  const value =
    mode === "time-of-day" ? parseTimeOfDay(text) : parseElapsed(text);
  if (value === null || value.precision !== precision) {
    return { display: shown, value: null };
  }
  // Shown as typed, never reformatted: the readback shows the canonical form.
  return { display: text, value };
}

/** A stored time, written the way the marshal reads it. */
export function formatTime(
  ms: number,
  mode: TimeMode,
  precision: Precision,
): string {
  return mode === "time-of-day"
    ? formatTimeOfDay(ms, precision)
    : formatElapsed(ms, precision);
}

const SAMPLE_MS: Readonly<Record<TimeMode, number>> = {
  // 09:06:12,345: a morning time, so the example shows the leading zero.
  "time-of-day": 9 * 3_600_000 + 6 * 60_000 + 12_345,
  // 7.06,945: a typical stage time.
  elapsed: 7 * 60_000 + 6_945,
};

/**
 * What to type for this mask, as an example in its own precision:
 * "Type every digit: 0906124 for 09:06:12,4", or "Type 7069 for 7.06,9".
 */
export function typingHint(mode: TimeMode, precision: Precision): string {
  const sample = SAMPLE_MS[mode];
  const reads = formatTime(
    sample - (sample % PRECISION_UNIT_MS[precision]),
    mode,
    precision,
  );
  const digits = reads.replace(/\D/g, "");
  return mode === "time-of-day"
    ? `Type every digit: ${digits} for ${reads}`
    : `Type ${digits} for ${reads}`;
}
