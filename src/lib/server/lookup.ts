import "server-only";
import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DeviceInfo, Grant, RallySummary } from "@/lib/api/contract";
import {
  controls,
  deviceGrants,
  devices,
  rallies,
  sections,
  stages,
} from "./db/schema";

/** Every rally, oldest first, for a device choosing which one to set up for. */
export async function listRallies(db: NodePgDatabase): Promise<RallySummary[]> {
  return db
    .select({ id: rallies.id, name: rallies.name })
    .from(rallies)
    .orderBy(asc(rallies.createdAt), asc(rallies.name));
}

type Ordered = { grant: Grant; sectionNumber: number; position: number };

async function stageGrants(db: NodePgDatabase, keyId: string) {
  const rows = await db
    .select({
      point: deviceGrants.point,
      sectionId: sections.id,
      sectionNumber: sections.number,
      position: stages.position,
      stageId: stages.id,
      number: stages.number,
      name: stages.name,
      scoring: stages.scoring,
      isPowerStage: stages.isPowerStage,
    })
    .from(deviceGrants)
    .innerJoin(stages, eq(deviceGrants.stageId, stages.id))
    .innerJoin(sections, eq(stages.sectionId, sections.id))
    .where(eq(deviceGrants.deviceKeyId, keyId));
  return rows.map(
    ({ point, sectionId, sectionNumber, position, ...stage }): Ordered => ({
      grant: { sectionId, point, target: { kind: "stage", ...stage } },
      sectionNumber,
      position,
    }),
  );
}

async function controlGrants(db: NodePgDatabase, keyId: string) {
  const rows = await db
    .select({
      point: deviceGrants.point,
      sectionId: sections.id,
      sectionNumber: sections.number,
      position: controls.position,
      controlId: controls.id,
      code: controls.code,
      controlKind: controls.kind,
    })
    .from(deviceGrants)
    .innerJoin(controls, eq(deviceGrants.controlId, controls.id))
    .innerJoin(sections, eq(controls.sectionId, sections.id))
    .where(eq(deviceGrants.deviceKeyId, keyId));
  return rows.map(
    ({ point, sectionId, sectionNumber, position, ...control }): Ordered => ({
      grant: { sectionId, point, target: { kind: "control", ...control } },
      sectionNumber,
      position,
    }),
  );
}

/**
 * What a device may enter, in itinerary order, or null if its key was never
 * authorized. A revoked device is still described, so it can say why its
 * records are refused.
 */
export async function describeDevice(
  db: NodePgDatabase,
  keyId: string,
): Promise<DeviceInfo | null> {
  const [device] = await db
    .select({ rallyId: devices.rallyId, revokedAt: devices.revokedAt })
    .from(devices)
    .where(eq(devices.keyId, keyId));
  if (device === undefined) return null;

  const ordered = [
    ...(await stageGrants(db, keyId)),
    ...(await controlGrants(db, keyId)),
  ].sort(
    (a, b) =>
      a.sectionNumber - b.sectionNumber ||
      a.position - b.position ||
      a.grant.point.localeCompare(b.grant.point),
  );

  return {
    keyId,
    rallyId: device.rallyId,
    revoked: device.revokedAt !== null,
    grants: ordered.map(({ grant }) => grant),
  };
}
