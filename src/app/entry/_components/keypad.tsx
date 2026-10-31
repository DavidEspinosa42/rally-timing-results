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
      className="h-16 rounded-md border border-rule text-3xl font-semibold active:bg-rule"
    >
      {children}
    </button>
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
        ⌫
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
