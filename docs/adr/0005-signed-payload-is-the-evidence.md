# 5. The signed payload is the evidence

## Status

Accepted, 2026-10

## Context

A signature verifies only against the exact bytes that were signed. Rebuilding
a record from database columns does not reproduce them: `pg` returns `bigint`
columns as strings, so the rebuilt JSON would differ and stop verifying even
though nobody altered the record.

## Decision

Postgres stores each record's canonical JSON text exactly as received
(`payload`), together with its `hash` and `signature`. The other columns are
derived from `payload` and exist only for queries. Every verification reads
`payload`, never JSON rebuilt from columns.

## Consequences

- Verification does not depend on column types, drivers, or later schema
  migrations; derived columns can always be recomputed from `payload`.
- Each record is stored twice (text and columns), which is negligible at a few
  thousand records per rally.
