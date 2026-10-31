import { DAY_MS, type Point, PRECISION_UNIT_MS, type Precision } from "./types";

export type ParsedTime = { ms: number; precision: Precision };

const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_ELAPSED_HOURS = 99;

// Time of day. `hh:mm` is to the minute; with seconds, colons take either
// decimal mark, and the Argentine dotted form `h.mm.ss,t` takes a comma.
const TOD_MINUTES = /^(\d{1,2}):(\d{2})$/;
const TOD_COLON = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/;
const TOD_DOTTED = /^(\d{1,2})\.(\d{2})\.(\d{2})(?:,(\d{1,3}))?$/;

// Elapsed time: `m:ss[.f]`, `h:mm:ss[.f]`, and the Argentine `m.ss,t` and
// `h.mm.ss,t`. Minutes may be empty in the dotted form, as in `.30,0`.
const ELAPSED_HOURS_COLON = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/;
const ELAPSED_HOURS_DOTTED = /^(\d{1,2})\.(\d{2})\.(\d{2})(?:,(\d{1,3}))?$/;
const ELAPSED_COLON = /^(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/;
const ELAPSED_DOTTED = /^(\d{1,3})?\.(\d{2})(?:,(\d{1,3}))?$/;

/** The precision a fraction with this many digits is written to. */
function precisionOfDigits(digits: number): Precision {
  if (digits === 0) return "S";
  if (digits === 1) return "DS";
  if (digits === 2) return "CS";
  return "MS";
}

function fraction(digits: string | undefined): ParsedTime {
  if (digits === undefined) return { ms: 0, precision: "S" };
  return {
    ms: Number(digits.padEnd(3, "0")),
    precision: precisionOfDigits(digits.length),
  };
}

function sum(
  hours: number,
  minutes: number,
  seconds: number,
  fractionDigits: string | undefined,
): ParsedTime | null {
  if (minutes > 59 || seconds > 59) return null;
  const { ms, precision } = fraction(fractionDigits);
  return {
    ms: hours * HOUR_MS + minutes * MINUTE_MS + seconds * SECOND_MS + ms,
    precision,
  };
}

/** Parses a time of day into ms since local midnight, or null if invalid. */
export function parseTimeOfDay(input: string): ParsedTime | null {
  const text = input.trim();

  const toMinute = TOD_MINUTES.exec(text);
  if (toMinute) {
    const [, h = "", m = ""] = toMinute;
    const parsed = sum(Number(h), Number(m), 0, undefined);
    if (parsed === null || Number(h) > 23) return null;
    return { ms: parsed.ms, precision: "MIN" };
  }

  const full = TOD_COLON.exec(text) ?? TOD_DOTTED.exec(text);
  if (!full) return null;
  const [, h = "", m = "", s = "", f] = full;
  if (Number(h) > 23) return null;
  return sum(Number(h), Number(m), Number(s), f);
}

/** Parses an elapsed time (for example a stage time), or null if invalid. */
export function parseElapsed(input: string): ParsedTime | null {
  const text = input.trim();

  const withHours =
    ELAPSED_HOURS_COLON.exec(text) ?? ELAPSED_HOURS_DOTTED.exec(text);
  if (withHours) {
    const [, h = "", m = "", s = "", f] = withHours;
    return sum(Number(h), Number(m), Number(s), f);
  }

  const minutesOnly = ELAPSED_COLON.exec(text) ?? ELAPSED_DOTTED.exec(text);
  if (!minutesOnly) return null;
  const [, m = "0", s = "", f] = minutesOnly;
  const seconds = Number(s);
  if (seconds > 59) return null;
  const { ms, precision } = fraction(f);
  return { ms: Number(m) * MINUTE_MS + seconds * SECOND_MS + ms, precision };
}

function assertWritable(ms: number, precision: Precision): void {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(`not a non-negative integer of ms: ${ms}`);
  }
  if (ms % PRECISION_UNIT_MS[precision] !== 0) {
    throw new RangeError(
      `${ms} ms has more digits than precision ${precision}`,
    );
  }
}

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

function fractionText(fractionMs: number, precision: Precision): string {
  switch (precision) {
    case "MIN":
    case "S":
      return "";
    case "DS":
      return `,${fractionMs / 100}`;
    case "CS":
      return `,${pad(fractionMs / 10, 2)}`;
    case "MS":
      return `,${pad(fractionMs, 3)}`;
  }
}

/** Formats ms since midnight as `hh:mm` or `hh:mm:ss,f`. */
export function formatTimeOfDay(ms: number, precision: Precision): string {
  assertWritable(ms, precision);
  if (ms >= DAY_MS) throw new RangeError(`not within one day: ${ms}`);
  const h = Math.floor(ms / HOUR_MS);
  const m = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (precision === "MIN") return `${pad(h, 2)}:${pad(m, 2)}`;
  const s = Math.floor((ms % MINUTE_MS) / SECOND_MS);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${fractionText(ms % SECOND_MS, precision)}`;
}

/**
 * Formats an elapsed time in Argentine notation: `m.ss,t`, or `h.mm.ss,t`
 * from one hour. A `MIN` value is written with `.00` seconds.
 */
export function formatElapsed(ms: number, precision: Precision): string {
  assertWritable(ms, precision);
  const h = Math.floor(ms / HOUR_MS);
  if (h > MAX_ELAPSED_HOURS)
    throw new RangeError(`over ${MAX_ELAPSED_HOURS} h: ${ms}`);
  const m = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  const s = Math.floor((ms % MINUTE_MS) / SECOND_MS);
  const tail = `${pad(s, 2)}${fractionText(ms % SECOND_MS, precision)}`;
  return h > 0 ? `${h}.${pad(m, 2)}.${tail}` : `${m}.${tail}`;
}

/**
 * The precision a reading at this point is usually written to: special
 * stages to the tenth, time controls to the minute, practice to the
 * thousandth.
 */
export function defaultPrecision(
  point: Point,
  options: { practice?: boolean } = {},
): Precision {
  if (point === "TC") return "MIN";
  return options.practice === true ? "MS" : "DS";
}
