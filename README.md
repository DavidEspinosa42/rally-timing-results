# Rally Stage Times

An offline-first web app for rally marshals. A marshal types in a car number
and the time shown by the event's timing equipment; the phone signs each entry
on the spot, so any later change is detectable, and sends the signed records to
a central database when there is a connection.

## Setup

Requires [pnpm](https://pnpm.io) 12 (the version in `packageManager`). pnpm
downloads and uses the Node.js version declared in `package.json`
(`devEngines.runtime`) for the project's scripts.

```sh
pnpm install
pnpm dev                # http://localhost:3000, with db:server running
pnpm build && pnpm start
```

The app needs the local database: see [Database](#database).

Checks, all of which must pass before a change is done:

```sh
pnpm typecheck          # next typegen, then tsc --noEmit (TypeScript 7)
pnpm lint               # Biome; auto-fix with pnpm lint --write
pnpm test               # Vitest; one file: pnpm test path/to/file.test.ts
```

## Database

Postgres runs locally as [PGlite](https://pglite.dev), with no Docker or
installed server. Its data lives in `.data/pglite` (git-ignored).

```sh
cp .env.example .env.local   # once; DATABASE_URL points at the local server
pnpm db:server               # in its own terminal; stop it with Ctrl+C
pnpm db:migrate              # applies the migrations in drizzle/
```

- `pnpm db:server` is the only process that opens `.data/pglite`. It listens
  on `127.0.0.1` at the port in `DATABASE_URL`, and the app, the scripts and
  drizzle-kit all connect through that URL. A second copy finds the port in
  use and exits without opening the data.
- Stop it with Ctrl+C so it closes the database cleanly.
- After changing `src/lib/server/db/schema.ts`, run
  `pnpm db:generate --name <change>`, then `pnpm db:migrate`. The files in
  `drizzle/` are generated; do not edit them.
- To start over, stop `db:server` and delete `.data/`.
- Moving to a hosted or installed Postgres only changes `DATABASE_URL`.
- `GET /api/health` answers `{"ok":true}` when the app can reach the
  database, and 503 when it cannot.

## Seed and device authorization

There is no admin interface yet: rallies and devices are set up from the
command line, with `db:server` running.

```sh
pnpm db:seed
pnpm device:authorize <public-key> SS3 FINISH
pnpm device:authorize <public-key> TC4A TC
```

- `pnpm db:seed` creates a dummy rally with generated data only. Its
  structure follows a typical regional event: one leg over two days, four
  sections, a non-scoring shakedown (`SS0`), seven special stages ending in a
  Power Stage, coded time controls with allotted times, a flexi service with
  a maximum, and 70 car numbers in 10 classes. Running it again does nothing.
- `pnpm device:authorize` registers a device's raw Ed25519 public key
  (64 hex characters) and grants it one point: `SS<n>` with
  `START`, `FINISH`, `SPLIT` or `STOP`, or `TC<code>` with `TC`. Run it again
  for each further point; one device can hold several, for example a regroup
  control and the `FINISH` of the stage before it. With more than one rally,
  add `--rally <id>`.
- A device key belongs to one rally. A device needs a new key, and a new
  authorization, for the next rally.

## Documentation

- [ROADMAP.md](ROADMAP.md): planned work and how to start on it.
- [AGENTS.md](AGENTS.md): instructions for coding agents: commands, layout,
  and the integrity rules every change must keep.
- [docs/domain.md](docs/domain.md): rally terms, the regulations the app
  relies on, and the reference event.
- [docs/landscape.md](docs/landscape.md): existing tools and practices, and
  where this app fits.
- [docs/adr/](docs/adr/): design decisions and why they were made.

## Data policy

This application strictly processes anonymized car numbers and timestamps. It
does not collect, process, or store personal user data, PII, or financial
records. All development relies on generated dummy data.

## Ownership

This is a 100% independent, personal side project. It is not related to,
sponsored by, or developed for any employer or client.

## License

Released under the MIT License. See [LICENSE](LICENSE).

## Not a timing system

This app does not measure time. Marshals manually enter times produced by the
event's existing timing equipment.
