# Domain

What a developer needs to know about rallies to work on this app. The rules
below are common to rally regulations in Argentina. A championship's own
regulations may change a value (a penalty, a tolerance, an interval), so code
takes these values as per-rally settings, with the values here as defaults.

## Terms

- **Cómputos**: the role that computes and publishes the official results,
  usually run by the event's timing provider.
- **Special stage** (PE) and **time control** (CH).
- **Leg → Section → Sector** is the regulated hierarchy. A sector
  is the stretch between two time controls. Groups of stages are colloquially
  called "rulos"; that is not a regulated term and has no entity here.

## Rules and facts

- **The app never measures time.** Marshals type the reading of the event's
  own timing equipment. The main risk is transcription error, so checks on
  what was typed matter more than clock precision.
- **Typing times:** a time of day is typed with every digit, both hour digits
  included (0905 for 09:05), so a half-typed time can never be saved. A stage
  time keeps variable-width minutes (7.06,9 or 12.06,9). Every entry is read
  back in full before it is signed.
- **Reference event:** a typical regional rally from 2026. 1 leg over two days (section 1
  on Saturday, section 3 on Sunday), 4 sections, 7 special stages, time
  controls coded CH0, 1, 1A…1H, 2, 3, 4, 4A…4D. 71 entries, 47 classified, 10
  classes (RC2, MR, RN4, RC3, A1, RC5, N1, RC6, N3, N2), car numbers up to
  699, about 2,800 records. The seed copies this structure with dummy data.
- **Precision depends on the point**: special stages to the
  tenth, time controls to the whole minute, practice to the thousandth. Each
  record stores its `precision` and `source`.
- **Time of day vs elapsed:** a record has `timeOfDayMs` (ms since local
  midnight of the section's date, in the rally's `timeZone`) or `elapsedMs`.
  Night stages cross midnight; results resolve the rollover. `enteredAtMs` is
  only an audit timestamp from the device clock.
- **Controls:** every control is a time control (`point = TC`) whose meaning
  comes from `controls.kind` (service, parc fermé, regroup, technical zone…).
  Each has an allotted time, and may have a maximum (flexi service, for example
  `MAX 0:30`) or allow early arrival.
- **Late finish times**: finish photocells are backed up by
  stopwatches, and a finish time can be recorded at the next regroup. One
  device may hold grants for several stages, controls and points, and a primary
  and a backup reading can coexist for the same car and point.
- **Penalties** are tied to a control or stage and a `reason`, as Cómputos
  shows them (for example `CH4 1.10,0`, `CH5 .30,0 Chicane`). Defaults:
  - Time control late: 10 s per minute or fraction. Early: 1 min per minute, unless the control allows early arrival.
  - Maximum delay of 15 min between time controls, or 30 min accumulated in a
    section → retired.
  - False start: 10 s, then 1 min, then 3 min. Late start: 1 min
    per minute.
  - Chicane: 30 s, then 1 min, plus 10 s per element knocked over (usually set by
    each event's special regulations).
- **Retirement and restart** ("rally 2"): a crew that retires can
  restart in the next section after the overnight regroup. Each missed special
  stage gets the class's best time plus 5 min; an engine change adds 20 min. A
  crew that retires on the last day is not classified. Interrupted stages get
  notional times.
- **Classification levels**: unofficial, partial unofficial (end
  of a leg), provisional (signed by the clerk of the course) and final
  (approved by the stewards). Protests close 1 hour after the provisional
  classification is published. The Power Stage has its own
  classification: stage time plus that stage's penalties, and the crew must
  check in at the sector's closing time control.
  Shakedown does not count.
- **Restart example** (made-up figures): if the best RC2 time on a special
  stage is 7.06,9, an RC2 crew that missed that stage after retiring is given
  12.06,9, which is 7.06,9 plus 5:00.
- **Argentine notation:** `m.ss,t` and `h.mm.ss,t` with a decimal comma, a
  difference to first and to the previous car, ties shown as `51=` and broken
  by the best time on the first special stage.
- **Names stay out.** Official results show names and nationality; this app
  produces results by car number and class only, and names are joined in the
  organizer's or Cómputos' own system. That is why the export for Cómputos is
  the main integration.
- **Device keys:** one non-extractable Ed25519 key per device and rally,
  authorized once. Not rotated per day, because day 2 often starts at stages
  with no signal, where a new key could not be authorized.
