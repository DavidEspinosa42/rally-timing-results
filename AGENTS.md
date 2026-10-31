<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Project

Rally Stage Times: an offline-first PWA where rally marshals manually enter
times read from the event's existing timing equipment. Each entry is signed on
the device (Ed25519 via WebCrypto) and later synced to a local Postgres
(PGlite). This app never measures time. Planned work is in `ROADMAP.md`.

## Commands

- Install: `pnpm install`, then copy `.env.example` to `.env.local`
- Database: `pnpm db:server`, in its own terminal. It is the only process that
  opens `.data/pglite`; everything else connects through `DATABASE_URL`.
- Migrations: `pnpm db:migrate` (with `db:server` running)
- New migration after editing `src/lib/server/db/schema.ts`:
  `pnpm db:generate --name <change>`. Never edit files in `drizzle/` by hand.
- Seed dummy data: `pnpm db:seed` (with `db:server` running)
- Authorize a device: `pnpm device:authorize <public-key> <SS<n>|TC<code>> <point>`;
  repeat to grant more points. Add `--rally <id>` when there are several rallies.
- Dev server: `pnpm dev` (needs `db:server` running)
- Production build: `pnpm build`, then `pnpm start`
- Type check: `pnpm typecheck` (runs `next typegen`, then `tsc --noEmit`)
- Lint and format check: `pnpm lint` (Biome); auto-fix: `pnpm lint --write`
- Tests: `pnpm test`; one file: `pnpm test path/to/file.test.ts`

Before finishing any change, run `pnpm typecheck && pnpm lint && pnpm test`.
All three must pass.

## Layout

- `src/lib/record/`: shared by client and server (types, time parsing,
  canonical encoding, hashing, signing, chain). Only `crypto.subtle`; no
  browser-only or Node-only APIs.
- `src/lib/client/`: browser only (Dexie, device key, entry service, sync loop).
  Every module starts with `import "client-only"`.
- `src/lib/server/`: server only (Postgres client, Drizzle schema, verification).
  Every module starts with `import "server-only"`.
- `src/lib/api/`: zod schemas of API response bodies, shared by the route
  handlers and the client, which parses every response with them.
- `src/app/api/`: route handlers. `src/app/sw.ts`: service worker.
- `src/app/entry/`: the entry screen, a static shell around the client
  components in `_components/`. `/` redirects there.
- `scripts/`: command-line scripts run outside Next.
- `drizzle/`: generated SQL migrations and drizzle-kit snapshots (not
  checked by Biome).
- `docs/`: `domain.md` (rally terms and regulations), `landscape.md`,
  and `adr/` (architecture decision records).
- Tests live next to the code as `*.test.ts`. `test/` holds only shared test
  helpers and checks of the test setup itself.

## Next.js and database rules

- Cache Components is on. Do not add `runtime` or `dynamic` segment exports.
  A `GET` handler that reads the database calls `await connection()` first.
- App code never imports PGlite. Database access goes only through
  `src/lib/server/db/client.ts` (one lazy `pg` pool from `DATABASE_URL`).
- Only one process opens `.data/pglite`: the database server script. Never
  open it from another script or start a second server.
- No named prepared statements: every connection shares one PGlite backend.
- Use Drizzle's SQL-like query builder. Do not define `relations()` or use
  `db.query`: Relational Queries v1 is removed in Drizzle 1.0.
- Scripts run as `node --conditions=react-server --import tsx`, so modules
  marked `server-only` load outside Next.
- The service worker never caches `/api/` responses (`NetworkOnly`), and it
  never calls `skipWaiting` on its own.
- `/api/sync` is a route handler, not a Server Action: devices call it as
  plain REST.

## Code style

- TypeScript strict. No `any`, no `!` non-null assertions.
- Validate all external input with zod at the boundary (API bodies, Dexie reads
  of old data, URL params).
- Named exports only. Let Biome format; do not hand-format.
- Comments explain why, not what.
- When a change alters a domain rule, update `docs/domain.md` in the same
  commit. When it reverses or adds a design decision, add an ADR to `docs/adr/`.

## Integrity rules (never break)

- Records are append-only. Never update or delete a record, locally or in
  Postgres. Corrections are new `VOID` records that reference the original.
- Any change to signed fields, the canonical encoding, or the hash input needs a
  new `schema` version (`rally-timing/record/v2`), and v1 records must keep
  verifying.
- Sign and save in one Dexie transaction, before any network call.
- Private keys are generated non-extractable. Never export, log, or send them.
- Server inserts use `ON CONFLICT (record_id) DO NOTHING`; sync stays idempotent.
- Postgres keeps each record's signed `payload` exactly as received. Verify
  from `payload`; never rebuild the signed JSON from columns.
- One device key per device and rally. Do not add per-day key rotation.
- Treat every `/api/sync` payload as untrusted: schema, signature, device
  authorization, then chain.

## Data policy

- Store only car numbers, classes, times, penalties, and statuses. Never add
  names, contact details, locations, photos, or any other PII.
- Fixtures, seeds, and tests use generated dummy data only.

## Dependencies

- Ask before adding a dependency. Prefer platform APIs.
- Keep versions pinned (`saveExact`). Check current library docs before using
  an API.
- Never lower `minimumReleaseAge` or turn off `trustPolicy` to get a fresh
  release installed; wait for it instead.
- Use the Node version pnpm pins (`devEngines.runtime`); do not add `.nvmrc`.

## Commits

- Conventional Commits: `feat(scope): …`, `fix`, `chore`, `docs`, `test`.
- One concern per commit, small enough to review line by line. Each commit
  passes typecheck, lint, and test on its own.
- Do not commit or push unless asked. Never commit `.data/` or any `.env*`
  file other than `.env.example`.
- When you add or rename a script, update the Commands section here and the
  README in the same commit.

## Secrets

- Secrets live in `.env.local` (git-ignored). `.env.example` lists every
  variable without secret values. Never hard-code secrets.
