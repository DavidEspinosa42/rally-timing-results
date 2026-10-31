import "server-only";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  PENALTY_REASONS,
  POINTS,
  PRECISIONS,
  RECORD_KINDS,
  SOURCE_ROLES,
  SOURCES,
  STATUSES,
} from "../../record/types";

// The meaning of a time control. Every control takes the TC point.
export const CONTROL_KINDS = [
  "TC",
  "SERVICE_IN",
  "SERVICE_OUT",
  "PARC_FERME_IN",
  "PARC_FERME_OUT",
  "REGROUP_IN",
  "REGROUP_OUT",
  "TECH_ZONE",
] as const;

// Enums come from the record types, so the database and the signed record
// schema cannot drift apart.
export const recordKind = pgEnum("record_kind", RECORD_KINDS);
// Not "point": that name is a built-in geometric type in pg_catalog, which
// comes first in the search path.
export const point = pgEnum("record_point", POINTS);
export const precision = pgEnum("precision", PRECISIONS);
export const source = pgEnum("source", SOURCES);
export const sourceRole = pgEnum("source_role", SOURCE_ROLES);
export const status = pgEnum("status", STATUSES);
export const penaltyReason = pgEnum("penalty_reason", PENALTY_REASONS);
export const controlKind = pgEnum("control_kind", CONTROL_KINDS);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const isSha256Hex = (column: AnyPgColumn) => sql`${column} ~ '^[0-9a-f]{64}$'`;

// Rally structure: rally → leg → section → itinerary (stages and controls).

export const rallies = pgTable("rallies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // IANA zone (for example America/Argentina/Buenos_Aires) that every
  // timeOfDayMs of this rally is measured in.
  timeZone: text("time_zone").notNull(),
  createdAt: createdAt(),
});

export const legs = pgTable(
  "legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rallyId: uuid("rally_id")
      .notNull()
      .references(() => rallies.id),
    number: integer("number").notNull(),
  },
  (t) => [
    unique().on(t.rallyId, t.number),
    check("legs_number_positive", sql`${t.number} >= 1`),
  ],
);

// The date belongs to the section, not the leg: one leg can span two days.
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id),
    number: integer("number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    // Start of the first car, in ms since local midnight of `date`.
    firstStartMs: integer("first_start_ms").notNull(),
  },
  (t) => [
    unique().on(t.legId, t.number),
    check("sections_number_positive", sql`${t.number} >= 1`),
    check(
      "sections_first_start_in_day",
      sql`${t.firstStartMs} >= 0 AND ${t.firstStartMs} < 86400000`,
    ),
  ],
);

// Stages and controls share one itinerary order per section: `position` is
// unique within each table, and the seed keeps it unique across both.
export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    position: integer("position").notNull(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    distanceKm: numeric("distance_km", {
      precision: 6,
      scale: 2,
      mode: "number",
    }).notNull(),
    // False for a shakedown: its times do not count.
    scoring: boolean("scoring").notNull().default(true),
    isPowerStage: boolean("is_power_stage").notNull().default(false),
    isSuperSpecial: boolean("is_super_special").notNull().default(false),
  },
  (t) => [
    unique().on(t.sectionId, t.position),
    check("stages_distance_positive", sql`${t.distanceKm} > 0`),
    check(
      "stages_power_stage_scores",
      sql`NOT ${t.isPowerStage} OR ${t.scoring}`,
    ),
  ],
);

export const controls = pgTable(
  "controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    position: integer("position").notNull(),
    // As printed on the itinerary, for example "0", "1A" or "4D".
    code: text("code").notNull(),
    kind: controlKind("kind").notNull().default("TC"),
    // Allotted time from the previous control ("T. Otorgado"); null for the
    // first control.
    allottedMin: integer("allotted_min"),
    // A maximum stay, for example a flexi service with MAX 0:30.
    maxMin: integer("max_min"),
    earlyAllowed: boolean("early_allowed").notNull().default(false),
  },
  (t) => [
    unique().on(t.sectionId, t.position),
    check(
      "controls_minutes_non_negative",
      sql`coalesce(${t.allottedMin}, 0) >= 0 AND coalesce(${t.maxMin}, 0) >= 0`,
    ),
  ],
);

// Entry list: car number → class. No names, by design.

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rallyId: uuid("rally_id")
      .notNull()
      .references(() => rallies.id),
    code: text("code").notNull(),
  },
  (t) => [unique().on(t.rallyId, t.code)],
);

export const entries = pgTable(
  "entries",
  {
    rallyId: uuid("rally_id")
      .notNull()
      .references(() => rallies.id),
    carNumber: integer("car_number").notNull(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
  },
  (t) => [
    primaryKey({ columns: [t.rallyId, t.carNumber] }),
    check("entries_car_number_range", sql`${t.carNumber} BETWEEN 1 AND 999`),
  ],
);

// Devices: one Ed25519 key per device and rally, authorized once.

export const devices = pgTable(
  "devices",
  {
    // SHA-256 of the raw public key: the deviceKeyId in every record.
    keyId: text("key_id").primaryKey(),
    // The raw 32-byte public key, hex. Signatures verify against this.
    publicKey: text("public_key").notNull().unique(),
    rallyId: uuid("rally_id")
      .notNull()
      .references(() => rallies.id),
    authorizedAt: timestamp("authorized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    check("devices_key_id_hex", isSha256Hex(t.keyId)),
    check("devices_public_key_hex", isSha256Hex(t.publicKey)),
  ],
);

// What a device may enter: a point on a stage or on a control. A device can
// hold several, for example a regroup that also enters the previous FINISH.
export const deviceGrants = pgTable(
  "device_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceKeyId: text("device_key_id")
      .notNull()
      .references(() => devices.keyId),
    stageId: uuid("stage_id").references(() => stages.id),
    controlId: uuid("control_id").references(() => controls.id),
    point: point("point").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique()
      .on(t.deviceKeyId, t.stageId, t.controlId, t.point)
      .nullsNotDistinct(),
    check(
      "device_grants_one_target",
      sql`(${t.stageId} IS NULL) <> (${t.controlId} IS NULL)`,
    ),
    check(
      "device_grants_point_matches_target",
      sql`(${t.controlId} IS NOT NULL) = (${t.point} = 'TC')`,
    ),
  ],
);

// Records are append-only. `payload` is the canonical JSON exactly as signed
// and is the evidence; every other record column is derived from it for
// queries, and verification never rebuilds JSON from them.
export const records = pgTable(
  "records",
  {
    recordId: uuid("record_id").primaryKey(),
    deviceKeyId: text("device_key_id")
      .notNull()
      .references(() => devices.keyId),
    seq: bigint("seq", { mode: "number" }).notNull(),
    prevHash: text("prev_hash"),
    payload: text("payload").notNull(),
    hash: text("hash").notNull().unique(),
    signature: text("signature").notNull(),

    rallyId: uuid("rally_id")
      .notNull()
      .references(() => rallies.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    stageId: uuid("stage_id").references(() => stages.id),
    controlId: uuid("control_id").references(() => controls.id),
    kind: recordKind("kind").notNull(),
    point: point("point"),
    carNumber: integer("car_number"),
    timeOfDayMs: integer("time_of_day_ms"),
    elapsedMs: bigint("elapsed_ms", { mode: "number" }),
    precision: precision("precision"),
    source: source("source"),
    sourceRole: sourceRole("source_role"),
    refRecordId: uuid("ref_record_id"),
    penaltyMs: bigint("penalty_ms", { mode: "number" }),
    status: status("status"),
    reason: penaltyReason("reason"),
    enteredAtMs: bigint("entered_at_ms", { mode: "number" }).notNull(),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.deviceKeyId, t.seq),
    index("records_rally_car_idx").on(t.rallyId, t.carNumber),
    check(
      "records_one_target",
      sql`(${t.stageId} IS NULL) <> (${t.controlId} IS NULL)`,
    ),
    check("records_chain_start", sql`(${t.seq} = 0) = (${t.prevHash} IS NULL)`),
    check("records_hash_hex", isSha256Hex(t.hash)),
  ],
);
