# 9. Times of day are typed in full

## Status

Accepted, 2026-10

## Context

Marshals copy times from printed tapes and clocks onto a keypad, and the
main risk is a transcription error (see `docs/domain.md`). The time field
fills from the right as digits are typed, the way a reading is copied: 1, 15,
153, 1539. If a shorter run of digits already counted as a whole time, the
field would accept a time the marshal never meant: on the way to 15:39, the
three digits 153 read as 01:53.

## Decision

A time of day must be typed with every digit of its precision, both hour
digits included: 0905 for 09:05, 0906124 for 09:06:12,4. Until then it has
no value and cannot be saved. An elapsed time (a stage time) keeps a
variable-width minutes part, since 7.06,9 and 12.06,9 both occur, and needs
at least m.ss plus the fraction.

The field shows exactly what was typed and never reformats it while typing.
The readback before saving shows the time as it will be stored.

## Consequences

- A half-typed time of day can never be saved by mistake.
- Early-morning times need a leading zero, which clocks and timing printers
  already show. The empty time field says so, with an example in the current
  precision.
