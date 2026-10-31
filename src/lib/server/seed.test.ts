import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/server/db/client";
import {
  classes,
  controls,
  entries,
  legs,
  sections,
  stages,
} from "@/lib/server/db/schema";
import { DUMMY_RALLY_ID, seedDummyRally } from "@/lib/server/seed";
import { startTestDatabase } from "../../../test/db";

let stopDatabase: () => Promise<void>;

beforeAll(async () => {
  stopDatabase = await startTestDatabase();
}, 60_000);

afterAll(async () => {
  await stopDatabase();
});

describe("seedDummyRally", () => {
  it("creates the rally once", async () => {
    const first = await seedDummyRally(getDb());
    expect(first).toEqual({
      created: true,
      rallyId: DUMMY_RALLY_ID,
      counts: {
        sections: 4,
        stages: 8,
        controls: 19,
        classes: 10,
        entries: 70,
      },
    });
    const again = await seedDummyRally(getDb());
    expect(again.created).toBe(false);
    expect(await getDb().select().from(entries)).toHaveLength(70);
  });

  it("has one leg over two days, with the date on each section", async () => {
    const db = getDb();
    expect(
      await db.select().from(legs).where(eq(legs.rallyId, DUMMY_RALLY_ID)),
    ).toHaveLength(1);
    const days = (await db.select().from(sections))
      .sort((a, b) => a.number - b.number)
      .map((section) => section.date);
    expect(days).toEqual([
      "2026-11-14",
      "2026-11-14",
      "2026-11-15",
      "2026-11-15",
    ]);
  });

  it("has seven scoring stages ending in the Power Stage, and a shakedown", async () => {
    const all = (await getDb().select().from(stages)).sort(
      (a, b) => a.number - b.number,
    );
    const scoring = all.filter((stage) => stage.scoring);
    expect(scoring.map((stage) => stage.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(all.filter((stage) => !stage.scoring)).toMatchObject([
      { number: 0, name: "Shakedown" },
    ]);
    expect(all.filter((stage) => stage.isPowerStage)).toMatchObject([
      { number: 7 },
    ]);
  });

  it("has coded controls with allotted times, one flexi service and one early-arrival control", async () => {
    const all = await getDb().select().from(controls);
    const codes = all.map((control) => control.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(all.filter((control) => control.maxMin !== null)).toMatchObject([
      { code: "2D", kind: "SERVICE_OUT", maxMin: 30 },
    ]);
    expect(all.filter((control) => control.earlyAllowed)).toMatchObject([
      { code: "7A" },
    ]);
    // Only the controls that open a day have no allotted time.
    expect(
      all
        .filter((control) => control.allottedMin === null)
        .map((control) => control.code)
        .sort(),
    ).toEqual(["0", "4C"]);
  });

  it("keeps one itinerary order per section across stages and controls", async () => {
    const db = getDb();
    const positions = new Map<string, number[]>();
    const rows = [
      ...(await db.select().from(stages)),
      ...(await db.select().from(controls)),
    ];
    for (const { sectionId, position } of rows) {
      positions.set(sectionId, [...(positions.get(sectionId) ?? []), position]);
    }
    for (const list of positions.values()) {
      const sorted = [...list].sort((a, b) => a - b);
      expect(sorted).toEqual(sorted.map((_, i) => i + 1));
    }
  });

  it("has 70 entries in 10 classes, with car numbers up to 699", async () => {
    const db = getDb();
    expect(
      (await db.select().from(classes)).map((row) => row.code).sort(),
    ).toEqual(
      ["A1", "MR", "N1", "N2", "N3", "RC2", "RC3", "RC5", "RC6", "RN4"].sort(),
    );
    const numbers = (await db.select().from(entries)).map(
      (entry) => entry.carNumber,
    );
    expect(numbers).toHaveLength(70);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(699);
  });
});
