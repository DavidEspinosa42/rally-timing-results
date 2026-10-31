"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeviceInfo, Grant } from "@/lib/api/contract";
import type { LocalDb } from "@/lib/client/db";
import type { DeviceKey } from "@/lib/client/device-key";
import {
  type EntryFields,
  enterRecord,
  latestEntries,
} from "@/lib/client/entry";
import {
  defaultSource,
  grantKey,
  grantLabel,
  grantOf,
  ROLE_NAMES,
  SOURCE_NAMES,
} from "@/lib/client/labels";
import type { Persistence } from "@/lib/client/support";
import type { DrainOutcome } from "@/lib/client/sync";
import {
  formatTime,
  maskTime,
  maxDigits,
  precisionsFor,
  type TimeMode,
} from "@/lib/client/time-input";
import { defaultPrecision } from "@/lib/record/time";
import {
  MAX_CAR_NUMBER,
  MIN_CAR_NUMBER,
  type Precision,
  type RecordV1,
  SOURCE_ROLES,
  SOURCES,
  type Source,
  type SourceRole,
} from "@/lib/record/types";
import { Keypad } from "./keypad";
import { Readback } from "./readback";
import { RecentEntries, type RecentRow } from "./recent-entries";
import { StorageBadge } from "./storage-badge";
import { SyncIndicator } from "./sync-indicator";
import { useWakeLock } from "./use-wake-lock";

type Step = "car" | "time" | "readback";

const PRECISION_NAMES: Readonly<Record<Precision, string>> = {
  MIN: "Minute",
  S: "Second",
  DS: "Tenth",
  CS: "Hundredth",
  MS: "Thousandth",
};

const RECENT_LIMIT = 8;

function timeOf(record: RecordV1): string {
  if (record.kind !== "TIME") return record.kind.toLowerCase();
  if (record.timeOfDayMs !== null) {
    return formatTime(record.timeOfDayMs, "time-of-day", record.precision);
  }
  if (record.elapsedMs !== null) {
    return formatTime(record.elapsedMs, "elapsed", record.precision);
  }
  return "–";
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; name: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-graphite">
      {label}
      <select
        value={value}
        onChange={(event) => {
          const chosen = options.find((o) => o.value === event.target.value);
          if (chosen !== undefined) onChange(chosen.value);
        }}
        className="h-11 min-w-0 rounded-md border border-rule bg-paper px-2 text-base text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EntryView({
  db,
  deviceKey,
  device,
  persistence,
  syncStatus,
  onSaved,
}: {
  db: LocalDb;
  deviceKey: DeviceKey;
  device: DeviceInfo;
  persistence: Persistence;
  syncStatus: DrainOutcome | null;
  /** Called after each entry is saved, so it can be sent at once. */
  onSaved: () => void;
}) {
  const { grants } = device;
  const [grant, setGrant] = useState<Grant | undefined>(grants[0]);
  const [source, setSource] = useState<Source>(
    grant === undefined ? "OTHER" : defaultSource(grant),
  );
  const [role, setRole] = useState<SourceRole>("PRIMARY");
  const [mode, setMode] = useState<TimeMode>("time-of-day");
  const [precision, setPrecision] = useState<Precision>(
    grant === undefined ? "DS" : defaultPrecision(grant.point),
  );
  const [step, setStep] = useState<Step>("car");
  const [car, setCar] = useState("");
  const [digits, setDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [recent, setRecent] = useState<RecentRow[]>([]);

  useWakeLock(true);

  const carNumber = Number(car);
  const carValid =
    car !== "" && carNumber >= MIN_CAR_NUMBER && carNumber <= MAX_CAR_NUMBER;
  const masked = maskTime(digits, mode, precision);

  const refreshRecent = useCallback(async () => {
    const entries = await latestEntries(db, deviceKey, RECENT_LIMIT);
    setRecent(
      entries.map(({ record }) => {
        const held = grantOf(record, grants);
        return {
          recordId: record.recordId,
          carNumber: record.carNumber,
          target:
            held === undefined ? "Target no longer granted" : grantLabel(held),
          time: timeOf(record),
        };
      }),
    );
  }, [db, deviceKey, grants]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  function chooseGrant(key: string) {
    const next = grants.find((g) => grantKey(g) === key);
    if (next === undefined) return;
    setGrant(next);
    setSource(defaultSource(next));
    setMode("time-of-day");
    setPrecision(defaultPrecision(next.point));
    setDigits("");
  }

  function chooseMode(next: TimeMode) {
    setMode(next);
    setDigits("");
    if (!precisionsFor(next).includes(precision)) setPrecision("DS");
  }

  const typeDigit = useCallback(
    (digit: string) => {
      if (step === "car") setCar((c) => (c.length < 3 ? c + digit : c));
      if (step === "time") {
        setDigits((d) =>
          d.length < maxDigits(mode, precision) ? d + digit : d,
        );
      }
    },
    [step, mode, precision],
  );

  const deleteDigit = useCallback(() => {
    if (step === "car") setCar((c) => c.slice(0, -1));
    if (step === "time") setDigits((d) => d.slice(0, -1));
  }, [step]);

  const next = useCallback(() => {
    if (step === "car" && carValid) setStep("time");
    if (step === "time" && masked.value !== null) {
      setError(null);
      setStep("readback");
    }
  }, [step, carValid, masked.value]);

  // A hardware keyboard works too, for testing on a laptop.
  useEffect(() => {
    if (step === "readback") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement) return;
      if (/^\d$/.test(event.key)) typeDigit(event.key);
      else if (event.key === "Backspace") deleteDigit();
      else if (event.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, typeDigit, deleteDigit, next]);

  const backToTime = useCallback(() => setStep("time"), []);

  async function save() {
    if (grant === undefined || masked.value === null || !carValid) return;
    const { target, point, sectionId } = grant;
    const fields: EntryFields = {
      sectionId,
      stageId: target.kind === "stage" ? target.stageId : null,
      controlId: target.kind === "control" ? target.controlId : null,
      kind: "TIME",
      point,
      carNumber,
      timeOfDayMs: mode === "time-of-day" ? masked.value.ms : null,
      elapsedMs: mode === "elapsed" ? masked.value.ms : null,
      precision: masked.value.precision,
      source,
      sourceRole: role,
      refRecordId: null,
      penaltyMs: null,
      status: null,
      reason: null,
    };
    setSaving(true);
    try {
      await enterRecord(db, deviceKey, fields);
      setNotice(
        `Saved car ${carNumber}, ${grantLabel(grant)}, ${formatTime(masked.value.ms, mode, masked.value.precision)}.`,
      );
      setCar("");
      setDigits("");
      setStep("car");
      onSaved();
      await refreshRecent();
    } catch (cause) {
      setError(
        `Not saved: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (grant === undefined) {
    return (
      <p className="text-lg">
        This device has no points to enter yet. Ask the organizer to grant it a
        stage or a time control.
      </p>
    );
  }

  const onStage = grant.target.kind === "stage";
  const field = (active: boolean) =>
    `flex w-full items-baseline justify-between rounded-md border-2 px-3 py-2 text-left ${
      active ? "border-board bg-board text-black" : "border-rule"
    }`;

  return (
    <>
      <div className="mb-4">
        <SyncIndicator status={syncStatus} />
      </div>
      <div className="grid gap-3">
        <Select
          label="Entering"
          value={grantKey(grant)}
          options={grants.map((g) => ({
            value: grantKey(g),
            name: grantLabel(g),
          }))}
          onChange={chooseGrant}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Source"
            value={source}
            options={SOURCES.map((s) => ({ value: s, name: SOURCE_NAMES[s] }))}
            onChange={setSource}
          />
          <Select
            label="Role"
            value={role}
            options={SOURCE_ROLES.map((r) => ({
              value: r,
              name: ROLE_NAMES[r],
            }))}
            onChange={setRole}
          />
          {onStage && (
            <Select<TimeMode>
              label="Reading"
              value={mode}
              options={[
                { value: "time-of-day", name: "Time of day" },
                { value: "elapsed", name: "Stage time" },
              ]}
              onChange={chooseMode}
            />
          )}
          <Select
            label="Precision"
            value={precision}
            options={precisionsFor(mode).map((p) => ({
              value: p,
              name: PRECISION_NAMES[p],
            }))}
            onChange={(p) => {
              setPrecision(p);
              setDigits("");
            }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={() => setStep("car")}
          className={field(step === "car")}
        >
          <span className="text-lg">Car</span>
          <span className="text-5xl font-bold">{car === "" ? "–" : car}</span>
        </button>
        <button
          type="button"
          onClick={() => carValid && setStep("time")}
          className={field(step === "time")}
        >
          <span className="text-lg">
            {mode === "elapsed" ? "Stage time" : "Time"}
          </span>
          <span className="font-mono text-4xl font-semibold">
            {masked.display}
          </span>
        </button>
      </div>

      <p aria-live="polite" className="mt-2 min-h-6 text-graphite">
        {notice}
      </p>

      <div className="mt-2">
        <Keypad
          onDigit={typeDigit}
          onDelete={deleteDigit}
          onNext={next}
          nextLabel={step === "car" ? "Next" : "Check"}
          canNext={step === "car" ? carValid : masked.value !== null}
        />
      </div>

      <RecentEntries rows={recent} />

      <footer className="mt-8 grid gap-1 border-t border-rule pt-3">
        <StorageBadge persistence={persistence} />
        <p className="break-all text-sm text-graphite">
          Signing as device {deviceKey.keyId.slice(0, 8)}…
          {deviceKey.keyId.slice(-8)}
        </p>
      </footer>

      {step === "readback" && masked.value !== null && (
        <Readback
          carNumber={carNumber}
          time={formatTime(masked.value.ms, mode, masked.value.precision)}
          target={grantLabel(grant)}
          source={`${SOURCE_NAMES[source]}, ${ROLE_NAMES[role].toLowerCase()}`}
          saving={saving}
          error={error}
          onSave={() => void save()}
          onChange={backToTime}
        />
      )}
    </>
  );
}
