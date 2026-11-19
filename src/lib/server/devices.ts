import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { fromHex } from "@/lib/record/hash";
import { publicKeyId } from "@/lib/record/sign";
import { type Point, STAGE_POINTS } from "@/lib/record/types";
import {
  controls,
  deviceGrants,
  devices,
  legs,
  rallies,
  sections,
  stages,
} from "./db/schema";

/** A stage by its number (`SS3`, `SS0` for the shakedown) or a control by code (`TC4A`). */
export type Target =
  | { kind: "stage"; number: number }
  | { kind: "control"; code: string };

export function parseTarget(text: string): Target | null {
  const stageMatch = /^SS(\d{1,2})$/i.exec(text);
  if (stageMatch?.[1] !== undefined) {
    return { kind: "stage", number: Number(stageMatch[1]) };
  }
  const controlMatch = /^TC(\d{1,2}[A-Z]?)$/i.exec(text);
  if (controlMatch?.[1] !== undefined) {
    return { kind: "control", code: controlMatch[1].toUpperCase() };
  }
  return null;
}

export function formatTarget(target: Target): string {
  return target.kind === "stage" ? `SS${target.number}` : `TC${target.code}`;
}

export type AuthorizeInput = {
  /** The device's raw Ed25519 public key, 64 hex characters. */
  publicKey: string;
  target: Target;
  point: Point;
  /** Needed only when there is more than one rally. */
  rallyId: string | null;
};

export type AuthorizeResult =
  | { ok: true; keyId: string; rallyId: string; grantAdded: boolean }
  | { ok: false; error: string };

const fail = (error: string): AuthorizeResult => ({ ok: false, error });

async function importPublicKey(hex: string): Promise<CryptoKey | null> {
  const raw = fromHex(hex.toLowerCase());
  if (raw === null || raw.length !== 32) return null;
  try {
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "Ed25519" },
      true,
      ["verify"],
    );
  } catch {
    return null;
  }
}

async function chooseRally(
  db: NodePgDatabase,
  rallyId: string | null,
): Promise<string | AuthorizeResult> {
  const all = await db
    .select({ id: rallies.id, name: rallies.name })
    .from(rallies)
    .orderBy(asc(rallies.createdAt));
  if (rallyId !== null) {
    return all.some((rally) => rally.id === rallyId)
      ? rallyId
      : fail(`no rally with id ${rallyId}`);
  }
  const [only, ...others] = all;
  if (only === undefined)
    return fail("there is no rally yet; run npm run db:seed");
  if (others.length > 0) {
    const list = all.map((rally) => `  ${rally.id}  ${rally.name}`).join("\n");
    return fail(`there are several rallies; pass --rally <id>:\n${list}`);
  }
  return only.id;
}

/** The ids of every stage or control in the rally that matches the target. */
async function findTarget(db: NodePgDatabase, rallyId: string, target: Target) {
  if (target.kind === "stage") {
    return db
      .select({ id: stages.id })
      .from(stages)
      .innerJoin(sections, eq(stages.sectionId, sections.id))
      .innerJoin(legs, eq(sections.legId, legs.id))
      .where(and(eq(legs.rallyId, rallyId), eq(stages.number, target.number)));
  }
  return db
    .select({ id: controls.id })
    .from(controls)
    .innerJoin(sections, eq(controls.sectionId, sections.id))
    .innerJoin(legs, eq(sections.legId, legs.id))
    .where(and(eq(legs.rallyId, rallyId), eq(controls.code, target.code)));
}

/** Every target of the rally, in itinerary order, for error messages. */
async function listTargets(db: NodePgDatabase, rallyId: string) {
  const stageRows = await db
    .select({ number: stages.number })
    .from(stages)
    .innerJoin(sections, eq(stages.sectionId, sections.id))
    .innerJoin(legs, eq(sections.legId, legs.id))
    .where(eq(legs.rallyId, rallyId))
    .orderBy(asc(stages.number));
  const controlRows = await db
    .select({ code: controls.code })
    .from(controls)
    .innerJoin(sections, eq(controls.sectionId, sections.id))
    .innerJoin(legs, eq(sections.legId, legs.id))
    .where(eq(legs.rallyId, rallyId))
    .orderBy(asc(sections.number), asc(controls.position));
  return [
    ...stageRows.map((row) => `SS${row.number}`),
    ...controlRows.map((row) => `TC${row.code}`),
  ].join(" ");
}

/**
 * Registers the device key for the rally if it is new, then grants it one
 * point on one stage or control. Running it again adds further grants; a
 * grant it already holds is left as it is.
 */
export async function authorizeDevice(
  db: NodePgDatabase,
  input: AuthorizeInput,
): Promise<AuthorizeResult> {
  const publicKey = await importPublicKey(input.publicKey);
  if (publicKey === null) {
    return fail("the public key must be 64 hex characters (a raw Ed25519 key)");
  }
  const keyId = await publicKeyId(publicKey);

  const rallyId = await chooseRally(db, input.rallyId);
  if (typeof rallyId !== "string") return rallyId;

  const onStage = input.target.kind === "stage";
  const stagePoint = (STAGE_POINTS as readonly string[]).includes(input.point);
  if (onStage !== stagePoint) {
    return fail(
      onStage
        ? `a special stage takes ${STAGE_POINTS.join(", ")}, not ${input.point}`
        : `a time control takes TC, not ${input.point}`,
    );
  }

  const matches = await findTarget(db, rallyId, input.target);
  const [match, ...more] = matches;
  if (match === undefined || more.length > 0) {
    const problem = match === undefined ? "is not in" : "is ambiguous in";
    const available = await listTargets(db, rallyId);
    return fail(
      `${formatTarget(input.target)} ${problem} this rally. Targets: ${available}`,
    );
  }

  return db.transaction(async (tx) => {
    const [device] = await tx
      .select({ rallyId: devices.rallyId, revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.keyId, keyId))
      .for("update");
    if (device === undefined) {
      await tx.insert(devices).values({
        keyId,
        publicKey: input.publicKey.toLowerCase(),
        rallyId,
      });
    } else if (device.rallyId !== rallyId) {
      return fail(
        "this key is authorized for another rally; a device needs a new key per rally",
      );
    } else if (device.revokedAt !== null) {
      return fail("this key was revoked; the device needs a new key");
    }

    const added = await tx
      .insert(deviceGrants)
      .values({
        deviceKeyId: keyId,
        stageId: onStage ? match.id : null,
        controlId: onStage ? null : match.id,
        point: input.point,
      })
      .onConflictDoNothing()
      .returning({ id: deviceGrants.id });

    return { ok: true, keyId, rallyId, grantAdded: added.length > 0 };
  });
}
