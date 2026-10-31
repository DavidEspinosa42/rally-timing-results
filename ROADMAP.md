# Roadmap

## Before you start

1. Read `README.md` (setup, data policy), `AGENTS.md` (commands, layout, and
   the integrity rules, which apply to every item here), and
   `docs/domain.md` (rally terms, the rules each item relies on, and the
   reference event). The reasons behind the main design choices are in
   `docs/adr/`.
2. Read `src/lib/record/types.ts`: the signed record v1 and its enums are the
   core of the domain. Most items below add logic on top of these records
   rather than new record fields; a new signed field needs a `v2` schema.
3. Run the app with the seeded dummy rally (`pnpm db:server`, `pnpm db:migrate`,
   `pnpm db:seed`, `pnpm dev`) and enter a few times on `/entry`.
4. Rule values (penalties, tolerances, intervals) are the common defaults
   described in `docs/domain.md`. Championships can differ, so code takes them
   as per-rally settings instead of constants.
5. Check current library docs before using any API; versions are pinned.

## Initial version

Roadmap work starts from the finished initial version, which provides:
- A signed record format (v1): types, time parsing (including the Argentine
  notation `m.ss,t`), canonical encoding, SHA-256 hashing, Ed25519 signing, and
  a per-device hash chain.
- A local Postgres (PGlite) served by `pnpm db:server`, with a Drizzle schema
  for the full rally structure (legs, sections, special stages, time controls,
  classes, entries), devices, grants, and records.
- `POST /api/sync`, which verifies signature, device authorization, and chain
  and stores a batch up to the first record that fails
  (`docs/adr/0008-sync-stores-the-longest-valid-prefix.md`); `GET /api/rallies`
  and `GET /api/devices/<keyId>` for device setup; and `GET /api/health`.
  Response bodies are zod schemas in `src/lib/api/contract.ts`.
- Command-line scripts to seed a dummy rally and to authorize a device by its
  public key.
- An installable entry screen that works offline: choosing the rally, device
  setup with persistent storage, guided entry (car, then time, then a
  readback) with times of day typed in full
  (`docs/adr/0009-times-of-day-are-typed-in-full.md`), wake lock, and a
  service worker.
- An outbox that syncs when there is a connection, with backoff, and a status
  line that shows waiting entries and any record the server refused. A
  refused record stays on the phone until its cause is fixed.
- Continuous integration that runs typecheck, lint, tests, and the
  production build on every push.

Rallies and devices are set up from the command line; there is no admin
interface, results computation, penalty logic, or export yet.

## Integration with timing providers (13 h)

| Item                                                                                                                             | Hours |
| -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Export for Cómputos: a CSV by car number with stage times and penalties per control, in a format agreed with the timing provider | 3     |
| Import timing-system exports (CSV), each row signed together with the source file's hash                                         | 4     |
| Import the entry list (car number + class) from CSV                                                                              | 4     |
| Export results to CSV and PDF                                                                                                    | 2     |

## Administration (15 h)

| Item                                                                                                                                                                             | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Admin endpoints for rallies, legs, sections, itinerary, classes, entries, devices, and grants, protected by an `ADMIN_TOKEN` (a new variable in `.env.example`, without a value) | 4     |
| Admin UI: itinerary, devices and grants, a QR code of the device's public key                                                                                                    | 5     |
| Corrections and voids signed by the organizer                                                                                                                                    | 4     |
| A signed audit log of admin actions                                                                                                                                              | 2     |

## Results and regulations (34 h)

| Item                                                                                                                                                                                                                                                                         | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Results by special stage, section, leg, and overall, by class: penalties, voids, precision, Argentine notation, difference to first and to the previous car, average km/h, ties                                                                                              | 7     |
| Retirement and restart ("rally 2"): RET / RET_FINAL / RESTART, the class's best time + 5 min per missed special stage, +20 min for an engine change, not classified when retiring on the last day; notional times for an interrupted stage                                   | 6     |
| Start list per section: RC2 first and grouped classes, re-ordered by classification after section 1, intervals of 2 min (the first 20 cars) and 1 min; the scheduled minute as the default start time, so the marshal only enters exceptions                                 | 6     |
| Time-control penalties, with per-rally settings and these defaults: 10 s per minute late, 1 min per minute early, ideal-minute tolerance, controls with early arrival allowed, flexi service with a maximum, maximum delay of 15 or 30 min → RET; false start and late start | 7     |
| The four classification levels: unofficial, partial, provisional, final; a publication time signed by the organizer, the 1-hour protest window, notes such as "subject to the final scrutineering"                                                                           | 3     |
| Power Stage classification                                                                                                                                                                                                                                                   | 2     |
| Live public results when there is a connection                                                                                                                                                                                                                               | 3     |

## Safety (10 h)

| Item                                                                                                                                                                                                                                                                                                                | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Overdue-car alert: a car with a START on a special stage and no FINISH after the stage's expected time plus a margin (per-rally settings) is flagged on the organizer's screen, since it may have had an accident. Uses the START and FINISH records already synced; cars not yet seen at the START are not flagged | 6     |
| Stage stop ("red flag") broadcast: the organizer marks a stage as stopped, and every device holding a grant on it shows a banner on its next sync. The stop is a signed organizer record, and feeds the notional times for an interrupted stage                                                                     | 4     |

## Entry quality and field use (19 h)

| Item                                                                                                         | Hours |
| ------------------------------------------------------------------------------------------------------------ | ----- |
| Queue screen: record states and manual retry                                                                 | 3     |
| Double entry by two marshals, and reconciling photocell against backup stopwatch                             | 4     |
| Detecting typos and outliers: implausible time against the median, duplicate car number, FINISH before START | 3     |
| Readback of the stage time for the crew at the stop line                                                     | 3     |
| Field UX: fast sequential entry from a paper sheet, big touch targets, high contrast, one-handed use         | 3     |
| Spanish localization                                                                                         | 3     |

## Integrity and verification (31 h)

| Item                                                                                                                                                                                                                                                                                                                   | Hours |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| A public `/verify/[id]` page, a signed JSON export, and an independent verification CLI                                                                                                                                                                                                                                | 4     |
| Key lifecycle: rotation through a hand-over record signed by the previous key (no new authorization needed), a lost device, revocation                                                                                                                                                                                 | 4     |
| Auditing the device clock: `GET /api/time`, the offset of `enteredAtMs`, a warning                                                                                                                                                                                                                                     | 3     |
| Phone-to-phone relay by QR code: where a stage has no signal at all, a passing official's phone scans an animated QR code from the marshal's phone and carries its signed records out to the server. Records are signed, so any device can carry them and none can change them; the server's chain check still applies | 8     |
| Signed chain checkpoints: at the end of each section the organizer publishes a signed list of every device's last `seq` and hash, so dropping a device's newest records becomes detectable (the limit described in `docs/adr/0002-no-blockchain.md`)                                                                   | 4     |
| Digital time-card receipt: after the readback, the marshal's phone shows a QR code the crew can scan, holding their car number, time and control, signed by the device. The digital version of the paper time card crews carry; no personal data                                                                       | 5     |
| Protest evidence bundle: for one car at one control, export the signed records, their place in each device's chain, and a verification report the stewards can check independently, for example with the verification CLI                                                                                              | 3     |

## Offline and sync (11 h)

| Item                                                                                                                                                                      | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Background Sync (Android) and quota handling (`storage.estimate()`)                                                                                                       | 3     |
| Try `experimental.useOffline` for the connection banner (its HEAD probe is more reliable than `navigator.onLine`); the Dexie outbox stays the source of truth             | 1     |
| An "Update available" banner that activates the waiting service worker between entries (`@serwist/window`), since the service worker never calls `skipWaiting` on its own | 1     |
| LAN mode: a laptop at the service park as the server. `next start` has no HTTPS option, so a small local reverse proxy (for example Caddy) serves mkcert certificates     | 4     |
| Local logging and a sync diagnostics screen                                                                                                                               | 2     |

## Testing (10.5 h)

| Item                                                                                                                                                                                                                                                                                                                            | Hours |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Testing on real phones (iOS Safari, Android Chrome): Ed25519, `CryptoKey` in IndexedDB, wake lock, a chain spanning a 3-day rally. Over the LAN with `next dev --experimental-https` (mkcert certificates via `--experimental-https-key/cert/ca`) and the host in `allowedDevOrigins`, because WebCrypto needs a secure context | 2.5   |
| Playwright end-to-end tests against `next build && next start` (not dev): offline → online, reload with pending records, correcting an entry                                                                                                                                                                                    | 5     |
| A fake-rally simulator on top of the seed: many cars and devices entering and syncing concurrently                                                                                                                                                                                                                              | 2     |
| Pre-commit hooks (Biome, typecheck, tests)                                                                                                                                                                                                                                                                                      | 1     |

## Operations and maintenance (4.5 h)

| Item                                                                                                                                                                                               | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Backup and restore of `.data/pglite`, and running migrations at startup                                                                                                                            | 2     |
| Upgrading to Drizzle 1.0 (a release candidate as of October 2026; `drizzle-kit up` converts the migration folders) and Serwist 10 (in preview) once stable, and Next.js minors with `next upgrade` | 2     |
| Agent tooling: `next-devtools-mcp` in `.mcp.json` (the dev server's `/_next/mcp`), so agents can check routes and compile errors                                                                   | 0.5   |

## Documentation (3 h)

| Item                                                                                                                                                                                                                                                     | Hours |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Threat model: what the signature proves (this authorized device entered this value at this point in its chain, and nobody changed it since) and what it does not (that the value read from the timing equipment was right, or that the device clock was) | 2     |
| Keep `docs/landscape.md` current and add a source link for each product                                                                                                                                                                                  | 1     |

**Total: ~151 h**

Out of scope under the data policy: the administrative side of a rally
(licenses, insurance, registration).
