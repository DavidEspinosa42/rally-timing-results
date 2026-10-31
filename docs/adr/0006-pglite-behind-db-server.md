# 6. PGlite behind a single database server process

## Status

Accepted, 2026-10

## Context

Development runs locally, without Docker, and hosting is decided later. The
database should be Postgres from the start: Drizzle's Postgres and SQLite
schemas are different files with different column types, so starting on SQLite
would mean rewriting the schema and regenerating the migrations. PGlite runs
Postgres in WebAssembly, but it is single-connection, and only one process may
open its data directory.

## Decision

The database is PGlite in `./.data/pglite`, opened only by `pnpm db:server`.
That script checks that its port is free before opening the directory, then
serves the database over the Postgres protocol (`@electric-sql/pglite-socket`)
on `127.0.0.1`. Everything else (Next.js, scripts, drizzle-kit) connects with
`pg` through `DATABASE_URL`.

## Consequences

- Moving to a hosted or installed Postgres only changes `DATABASE_URL`.
- The app never imports PGlite, so its WebAssembly never reaches the server
  bundle.
- `db:server` must be running for development, migrations and scripts.
- All connections share one backend: the app's pool stays smaller than the
  server's `maxConnections`, and the app uses no named prepared statements.
