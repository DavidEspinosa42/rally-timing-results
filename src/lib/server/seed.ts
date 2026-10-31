import "server-only";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type CONTROL_KINDS,
  classes,
  controls,
  entries,
  legs,
  rallies,
  sections,
  stages,
} from "./db/schema";

// A dummy rally with the structure of a typical regional event (see
// docs/domain.md): one leg over two days, four sections, a non-scoring
// shakedown, seven special stages ending in a Power Stage, and coded time
// controls. Every name and number is generated; nothing comes from a real
// event or person.

export const DUMMY_RALLY_ID = "5eed0000-0000-4000-8000-000000000001";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

type ControlKind = (typeof CONTROL_KINDS)[number];

type ControlPlan = {
  type: "control";
  code: string;
  kind: ControlKind;
  allottedMin: number | null;
  maxMin: number | null;
  earlyAllowed: boolean;
};

type StagePlan = {
  type: "stage";
  number: number;
  name: string;
  distanceKm: number;
  scoring: boolean;
  isPowerStage: boolean;
};

type SectionPlan = {
  number: number;
  date: string;
  firstStartMs: number;
  itinerary: (ControlPlan | StagePlan)[];
};

const control = (
  code: string,
  kind: ControlKind,
  allottedMin: number | null,
  extra: { maxMin?: number; earlyAllowed?: boolean } = {},
): ControlPlan => ({
  type: "control",
  code,
  kind,
  allottedMin,
  maxMin: extra.maxMin ?? null,
  earlyAllowed: extra.earlyAllowed ?? false,
});

const stage = (
  number: number,
  distanceKm: number,
  extra: { name?: string; scoring?: boolean; isPowerStage?: boolean } = {},
): StagePlan => ({
  type: "stage",
  number,
  name: extra.name ?? `Stage ${number}`,
  distanceKm,
  scoring: extra.scoring ?? true,
  isPowerStage: extra.isPowerStage ?? false,
});

const SATURDAY = "2026-11-14";
const SUNDAY = "2026-11-15";

export const DUMMY_SECTIONS: readonly SectionPlan[] = [
  {
    number: 1,
    date: SATURDAY,
    firstStartMs: 9 * HOUR_MS,
    itinerary: [
      stage(0, 3.1, { name: "Shakedown", scoring: false }),
      control("0", "PARC_FERME_OUT", null),
      control("1", "TC", 25),
      stage(1, 14.2),
      control("2", "TC", 20),
      stage(2, 9.8),
      control("2A", "REGROUP_IN", 15),
      control("2B", "REGROUP_OUT", 20),
      control("2C", "SERVICE_IN", 10),
      // Flexi service: the crew may stay up to 30 minutes.
      control("2D", "SERVICE_OUT", 30, { maxMin: 30 }),
    ],
  },
  {
    number: 2,
    date: SATURDAY,
    firstStartMs: 13 * HOUR_MS + 30 * MINUTE_MS,
    itinerary: [
      control("3", "TC", 25),
      stage(3, 14.2),
      control("4", "TC", 20),
      stage(4, 9.8),
      control("4A", "REGROUP_IN", 15),
      // Overnight parc fermé, between the two days of the leg.
      control("4B", "PARC_FERME_IN", 10),
    ],
  },
  {
    number: 3,
    date: SUNDAY,
    firstStartMs: 8 * HOUR_MS + 30 * MINUTE_MS,
    itinerary: [
      control("4C", "PARC_FERME_OUT", null),
      control("5", "TC", 30),
      stage(5, 18.6),
      control("5A", "TECH_ZONE", 15),
      control("5B", "SERVICE_IN", 10),
      control("5C", "SERVICE_OUT", 20),
    ],
  },
  {
    number: 4,
    date: SUNDAY,
    firstStartMs: 12 * HOUR_MS,
    itinerary: [
      control("6", "TC", 25),
      stage(6, 11.3),
      control("7", "TC", 20),
      stage(7, 6.5, { isPowerStage: true }),
      control("7A", "PARC_FERME_IN", 15, { earlyAllowed: true }),
    ],
  },
];

// [class code, number of cars, first car number]. Car numbers come in
// blocks per class, up to 655, as in a large regional entry list.
export const DUMMY_CLASSES: readonly (readonly [string, number, number])[] = [
  ["RC2", 10, 1],
  ["MR", 4, 31],
  ["RN4", 5, 41],
  ["RC3", 8, 101],
  ["A1", 9, 201],
  ["RC5", 10, 301],
  ["N1", 6, 401],
  ["RC6", 7, 501],
  ["N3", 6, 601],
  ["N2", 5, 651],
];

export type SeedResult = {
  created: boolean;
  rallyId: string;
  counts: {
    sections: number;
    stages: number;
    controls: number;
    classes: number;
    entries: number;
  };
};

/** Creates the dummy rally, or does nothing if it is already there. */
export async function seedDummyRally(db: NodePgDatabase): Promise<SeedResult> {
  const counts = {
    sections: 0,
    stages: 0,
    controls: 0,
    classes: 0,
    entries: 0,
  };
  const [existing] = await db
    .select({ id: rallies.id })
    .from(rallies)
    .where(eq(rallies.id, DUMMY_RALLY_ID));
  if (existing !== undefined) {
    return { created: false, rallyId: DUMMY_RALLY_ID, counts };
  }

  await db.transaction(async (tx) => {
    await tx.insert(rallies).values({
      id: DUMMY_RALLY_ID,
      name: "Dummy Regional Rally",
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const [leg] = await tx
      .insert(legs)
      .values({ rallyId: DUMMY_RALLY_ID, number: 1 })
      .returning({ id: legs.id });
    if (leg === undefined) throw new Error("leg not created");

    for (const plan of DUMMY_SECTIONS) {
      const [section] = await tx
        .insert(sections)
        .values({
          legId: leg.id,
          number: plan.number,
          date: plan.date,
          firstStartMs: plan.firstStartMs,
        })
        .returning({ id: sections.id });
      if (section === undefined) throw new Error("section not created");
      counts.sections++;

      for (const [index, step] of plan.itinerary.entries()) {
        const position = index + 1;
        if (step.type === "stage") {
          const { type: _, ...fields } = step;
          await tx
            .insert(stages)
            .values({ ...fields, sectionId: section.id, position });
          counts.stages++;
        } else {
          const { type: _, ...fields } = step;
          await tx
            .insert(controls)
            .values({ ...fields, sectionId: section.id, position });
          counts.controls++;
        }
      }
    }

    for (const [code, cars, firstNumber] of DUMMY_CLASSES) {
      const [inserted] = await tx
        .insert(classes)
        .values({ rallyId: DUMMY_RALLY_ID, code })
        .returning({ id: classes.id });
      if (inserted === undefined) throw new Error("class not created");
      counts.classes++;
      await tx.insert(entries).values(
        Array.from({ length: cars }, (_, i) => ({
          rallyId: DUMMY_RALLY_ID,
          carNumber: firstNumber + i,
          classId: inserted.id,
        })),
      );
      counts.entries += cars;
    }
  });

  return { created: true, rallyId: DUMMY_RALLY_ID, counts };
}
