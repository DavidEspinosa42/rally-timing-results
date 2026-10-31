import { afterEach, describe, expect, it } from "vitest";
import type { Grant } from "@/lib/api/contract";
import type { LocalDb } from "@/lib/client/db";
import {
  type EntryPreferences,
  initialChoice,
  loadEntryPreferences,
  saveEntryPreferences,
} from "@/lib/client/preferences";
import { IDS } from "../../../test/fixtures";
import { newBrowserProfile, openLocalDb } from "../../../test/local-db";

const KEY = "ab".repeat(32);
const OTHER_KEY = "cd".repeat(32);

const finish: Grant = {
  sectionId: IDS.section,
  point: "FINISH",
  target: {
    kind: "stage",
    stageId: IDS.stage,
    number: 1,
    name: "Stage 1",
    scoring: true,
    isPowerStage: false,
  },
};

const control: Grant = {
  sectionId: IDS.section,
  point: "TC",
  target: {
    kind: "control",
    controlId: IDS.control,
    code: "1",
    controlKind: "TC",
  },
};

const opened: LocalDb[] = [];
function open(profile = newBrowserProfile()): LocalDb {
  const db = openLocalDb(profile);
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("entry preferences", () => {
  it("come back after the app is reopened", async () => {
    const profile = newBrowserProfile();
    await saveEntryPreferences(open(profile), KEY, {
      grant: finish,
      source: "STOPWATCH",
      sourceRole: "BACKUP",
      mode: "elapsed",
      precision: "CS",
    });
    expect(await loadEntryPreferences(open(profile), KEY)).toEqual({
      keyId: KEY,
      grant: `${IDS.stage}:FINISH`,
      source: "STOPWATCH",
      sourceRole: "BACKUP",
      mode: "elapsed",
      precision: "CS",
    });
  });

  it("belong to one key, so another rally starts from the defaults", async () => {
    const db = open();
    await saveEntryPreferences(db, KEY, {
      grant: finish,
      source: "CLOCK",
      sourceRole: "PRIMARY",
      mode: "time-of-day",
      precision: "DS",
    });
    expect(await loadEntryPreferences(db, OTHER_KEY)).toBeNull();
  });

  it("count as none when what is stored cannot be read", async () => {
    const db = open();
    await db.settings.put({
      name: "entryPreferences",
      // The type forbids this row; old or damaged storage can still hold it.
      value: { keyId: KEY, grant: "x" } as unknown as EntryPreferences,
    });
    expect(await loadEntryPreferences(db, KEY)).toBeNull();
  });
});

describe("initialChoice", () => {
  const saved = (change: Partial<EntryPreferences>): EntryPreferences => ({
    keyId: KEY,
    grant: `${IDS.stage}:FINISH`,
    source: "STOPWATCH",
    sourceRole: "BACKUP",
    mode: "elapsed",
    precision: "CS",
    ...change,
  });

  it("starts from the first grant's defaults when nothing was saved", () => {
    expect(initialChoice([control, finish], null)).toEqual({
      grant: control,
      source: "CLOCK",
      sourceRole: "PRIMARY",
      mode: "time-of-day",
      precision: "MIN",
    });
  });

  it("restores the saved choices while the device still holds that grant", () => {
    expect(initialChoice([control, finish], saved({}))).toEqual({
      grant: finish,
      source: "STOPWATCH",
      sourceRole: "BACKUP",
      mode: "elapsed",
      precision: "CS",
    });
  });

  it("falls back to the defaults when that grant was withdrawn", () => {
    expect(initialChoice([control], saved({}))).toMatchObject({
      grant: control,
      source: "CLOCK",
    });
  });

  it("reads a control as a time of day, whatever was saved", () => {
    expect(
      initialChoice([control], saved({ grant: `${IDS.control}:TC` })),
    ).toMatchObject({ mode: "time-of-day", precision: "CS" });
  });

  it("is null when the device holds no grant", () => {
    expect(initialChoice([], saved({}))).toBeNull();
  });
});
