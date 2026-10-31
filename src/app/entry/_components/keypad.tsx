"use client";

import type { ReactNode } from "react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function Key({
  children,
  label,
  onPress,
}: {
  children: ReactNode;
  label?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex h-16 items-center justify-center rounded-md border border-rule text-3xl font-semibold active:bg-rule"
    >
      {children}
    </button>
  );
}

// Drawn rather than the ⌫ character, whose glyph varies by font and sits off
// center. The cross is centered on the key; the point leans left.
function BackspaceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="34"
      height="34"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.5-7Z" />
      <path d="m11.5 9 6 6m0-6-6 6" />
    </svg>
  );
}

/** Sized for a thumb, and for gloves. */
export function Keypad({
  onDigit,
  onDelete,
  onNext,
  nextLabel,
  canNext,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onNext: () => void;
  nextLabel: string;
  canNext: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGITS.map((digit) => (
        <Key key={digit} onPress={() => onDigit(digit)}>
          {digit}
        </Key>
      ))}
      <Key label="Delete last digit" onPress={onDelete}>
        <BackspaceIcon />
      </Key>
      <Key onPress={() => onDigit("0")}>0</Key>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="h-16 rounded-md bg-board text-xl font-bold text-black disabled:opacity-35"
      >
        {nextLabel}
      </button>
    </div>
  );
}
