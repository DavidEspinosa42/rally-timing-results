import "client-only";
import type { z } from "zod";
import type { Grant } from "@/lib/api/contract";
import { defaultPrecision } from "@/lib/record/time";
import type { Precision, Source, SourceRole } from "@/lib/record/types";
import {
  type entryPreferencesSchema,
  type LocalDb,
  preferencesSettingSchema,
} from "./db";
import { defaultSource, grantKey } from "./labels";
import { precisionsFor, type TimeMode } from "./time-input";

export type EntryPreferences = z.infer<typeof entryPreferencesSchema>;

/** The choices the entry screen starts from. */
export type EntryChoice = {
  grant: Grant;
  source: Source;
  sourceRole: SourceRole;
  mode: TimeMode;
  precision: Precision;
};

/**
 * The marshal's last choices for this key, or null. Anything unreadable
 * (another key, an older format) counts as none: these are conveniences,
 * and the screen has sensible defaults.
 */
export async function loadEntryPreferences(
  db: LocalDb,
  keyId: string,
): Promise<EntryPreferences | null> {
  const parsed = preferencesSettingSchema.safeParse(
    await db.settings.get("entryPreferences"),
  );
  if (!parsed.success || parsed.data.value.keyId !== keyId) return null;
  return parsed.data.value;
}

export async function saveEntryPreferences(
  db: LocalDb,
  keyId: string,
  choice: EntryChoice,
): Promise<void> {
  await db.settings.put(
    preferencesSettingSchema.parse({
      name: "entryPreferences",
      value: {
        keyId,
        grant: grantKey(choice.grant),
        source: choice.source,
        sourceRole: choice.sourceRole,
        mode: choice.mode,
        precision: choice.precision,
      },
    }),
  );
}

/** The defaults for a grant: what its timing source usually is and writes. */
export function defaultChoice(grant: Grant): EntryChoice {
  return {
    grant,
    source: defaultSource(grant),
    sourceRole: "PRIMARY",
    mode: "time-of-day",
    precision: defaultPrecision(grant.point),
  };
}

/**
 * Where the entry screen starts: the saved choices when they still fit the
 * device's grants, otherwise the first grant's defaults. Null when the
 * device holds no grant at all.
 */
export function initialChoice(
  grants: readonly Grant[],
  saved: EntryPreferences | null,
): EntryChoice | null {
  const savedGrant =
    saved === null
      ? undefined
      : grants.find((grant) => grantKey(grant) === saved.grant);
  if (saved === null || savedGrant === undefined) {
    const [first] = grants;
    return first === undefined ? null : defaultChoice(first);
  }
  // A control is always read as a time of day.
  const mode =
    savedGrant.target.kind === "control" ? "time-of-day" : saved.mode;
  const precision = precisionsFor(mode).includes(saved.precision)
    ? saved.precision
    : defaultPrecision(savedGrant.point);
  return {
    grant: savedGrant,
    source: saved.source,
    sourceRole: saved.sourceRole,
    mode,
    precision,
  };
}
