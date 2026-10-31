"use client";

import { useEffect, useRef } from "react";

/**
 * The last check before an entry is signed: the car and the time are shown
 * large, set like a timing printer's tape, so the marshal compares them with
 * the source rather than with what they remember typing.
 */
export function Readback({
  carNumber,
  time,
  target,
  source,
  saving,
  error,
  onSave,
  onChange,
}: {
  carNumber: number;
  time: string;
  target: string;
  source: string;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onChange: () => void;
}) {
  const saveButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChange();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="readback-title"
      className="fixed inset-0 z-10 flex flex-col overflow-y-auto bg-paper px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <h2 id="readback-title" className="text-lg text-graphite">
        Check against the source before saving
      </h2>

      <div className="mx-auto my-6 w-full max-w-xs border-y-2 border-dashed border-ink px-5 py-6">
        <p className="text-base text-graphite">Car</p>
        <p className="font-mono text-[6.5rem] font-bold leading-none">
          {carNumber}
        </p>
        <p className="mt-6 text-base text-graphite">Time</p>
        <p className="font-mono text-5xl font-semibold leading-tight">{time}</p>
        <p className="mt-6 text-xl font-semibold">{target}</p>
        <p className="text-base text-graphite">{source}</p>
      </div>

      {error !== null && (
        <p role="alert" className="mb-3 font-semibold text-alert">
          {error}
        </p>
      )}

      <div className="mx-auto mt-auto grid w-full max-w-md gap-3">
        <button
          ref={saveButton}
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-16 rounded-md bg-board text-xl font-bold text-black disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save entry"}
        </button>
        <button
          type="button"
          onClick={onChange}
          disabled={saving}
          className="h-14 rounded-md border-2 border-ink text-lg font-semibold"
        >
          Change
        </button>
      </div>
    </div>
  );
}
