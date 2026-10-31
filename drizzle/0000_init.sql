CREATE TYPE "public"."control_kind" AS ENUM('TC', 'SERVICE_IN', 'SERVICE_OUT', 'PARC_FERME_IN', 'PARC_FERME_OUT', 'REGROUP_IN', 'REGROUP_OUT', 'TECH_ZONE');--> statement-breakpoint
CREATE TYPE "public"."penalty_reason" AS ENUM('TC_LATE', 'TC_EARLY', 'FALSE_START', 'LATE_START', 'CHICANE', 'ROUTE', 'RESTART', 'ENGINE_CHANGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."record_point" AS ENUM('START', 'FINISH', 'SPLIT', 'STOP', 'TC');--> statement-breakpoint
CREATE TYPE "public"."precision" AS ENUM('MIN', 'S', 'DS', 'CS', 'MS');--> statement-breakpoint
CREATE TYPE "public"."record_kind" AS ENUM('TIME', 'PENALTY', 'STATUS', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('PHOTOCELL_PRINTER', 'STOPWATCH', 'CLOCK', 'TRANSPONDER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."source_role" AS ENUM('PRIMARY', 'BACKUP');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('DNS', 'RET', 'RET_FINAL', 'RESTART', 'DSQ', 'NOTIONAL');--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rally_id" uuid NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "classes_rally_id_code_unique" UNIQUE("rally_id","code")
);
--> statement-breakpoint
CREATE TABLE "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"code" text NOT NULL,
	"kind" "control_kind" DEFAULT 'TC' NOT NULL,
	"allotted_min" integer,
	"max_min" integer,
	"early_allowed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "controls_section_id_position_unique" UNIQUE("section_id","position"),
	CONSTRAINT "controls_minutes_non_negative" CHECK (coalesce("controls"."allotted_min", 0) >= 0 AND coalesce("controls"."max_min", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_key_id" text NOT NULL,
	"stage_id" uuid,
	"control_id" uuid,
	"point" "record_point" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_grants_device_key_id_stage_id_control_id_point_unique" UNIQUE NULLS NOT DISTINCT("device_key_id","stage_id","control_id","point"),
	CONSTRAINT "device_grants_one_target" CHECK (("device_grants"."stage_id" IS NULL) <> ("device_grants"."control_id" IS NULL)),
	CONSTRAINT "device_grants_point_matches_target" CHECK (("device_grants"."control_id" IS NOT NULL) = ("device_grants"."point" = 'TC'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"key_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"rally_id" uuid NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "devices_key_id_hex" CHECK ("devices"."key_id" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "devices_public_key_hex" CHECK ("devices"."public_key" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"rally_id" uuid NOT NULL,
	"car_number" integer NOT NULL,
	"class_id" uuid NOT NULL,
	CONSTRAINT "entries_rally_id_car_number_pk" PRIMARY KEY("rally_id","car_number"),
	CONSTRAINT "entries_car_number_range" CHECK ("entries"."car_number" BETWEEN 1 AND 999)
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rally_id" uuid NOT NULL,
	"number" integer NOT NULL,
	CONSTRAINT "legs_rally_id_number_unique" UNIQUE("rally_id","number"),
	CONSTRAINT "legs_number_positive" CHECK ("legs"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rallies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"device_key_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"prev_hash" text,
	"payload" text NOT NULL,
	"hash" text NOT NULL,
	"signature" text NOT NULL,
	"rally_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"stage_id" uuid,
	"control_id" uuid,
	"kind" "record_kind" NOT NULL,
	"point" "record_point",
	"car_number" integer,
	"time_of_day_ms" integer,
	"elapsed_ms" bigint,
	"precision" "precision",
	"source" "source",
	"source_role" "source_role",
	"ref_record_id" uuid,
	"penalty_ms" bigint,
	"status" "status",
	"reason" "penalty_reason",
	"entered_at_ms" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_hash_unique" UNIQUE("hash"),
	CONSTRAINT "records_device_key_id_seq_unique" UNIQUE("device_key_id","seq"),
	CONSTRAINT "records_one_target" CHECK (("records"."stage_id" IS NULL) <> ("records"."control_id" IS NULL)),
	CONSTRAINT "records_chain_start" CHECK (("records"."seq" = 0) = ("records"."prev_hash" IS NULL)),
	CONSTRAINT "records_hash_hex" CHECK ("records"."hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leg_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"first_start_ms" integer NOT NULL,
	CONSTRAINT "sections_leg_id_number_unique" UNIQUE("leg_id","number"),
	CONSTRAINT "sections_number_positive" CHECK ("sections"."number" >= 1),
	CONSTRAINT "sections_first_start_in_day" CHECK ("sections"."first_start_ms" >= 0 AND "sections"."first_start_ms" < 86400000)
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"distance_km" numeric(6, 2) NOT NULL,
	"scoring" boolean DEFAULT true NOT NULL,
	"is_power_stage" boolean DEFAULT false NOT NULL,
	"is_super_special" boolean DEFAULT false NOT NULL,
	CONSTRAINT "stages_section_id_position_unique" UNIQUE("section_id","position"),
	CONSTRAINT "stages_distance_positive" CHECK ("stages"."distance_km" > 0),
	CONSTRAINT "stages_power_stage_scores" CHECK (NOT "stages"."is_power_stage" OR "stages"."scoring")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_rally_id_rallies_id_fk" FOREIGN KEY ("rally_id") REFERENCES "public"."rallies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controls" ADD CONSTRAINT "controls_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_device_key_id_devices_key_id_fk" FOREIGN KEY ("device_key_id") REFERENCES "public"."devices"("key_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_rally_id_rallies_id_fk" FOREIGN KEY ("rally_id") REFERENCES "public"."rallies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_rally_id_rallies_id_fk" FOREIGN KEY ("rally_id") REFERENCES "public"."rallies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_rally_id_rallies_id_fk" FOREIGN KEY ("rally_id") REFERENCES "public"."rallies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_device_key_id_devices_key_id_fk" FOREIGN KEY ("device_key_id") REFERENCES "public"."devices"("key_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_rally_id_rallies_id_fk" FOREIGN KEY ("rally_id") REFERENCES "public"."rallies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_rally_car_idx" ON "records" USING btree ("rally_id","car_number");