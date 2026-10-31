# 4. One key per device and rally

## Status

Accepted, 2026-10

## Context

A rally often spans two or more days. Authorizing a key means the organizer
registers the device's public key with the server, which needs a connection.
Day 2 often starts at stages with no signal, where a new key could not be
authorized.

## Decision

Each device generates one non-extractable key per rally at setup, and it is
authorized once, before the rally. Keys are not rotated per day. When rotation
is needed, it is a hand-over record signed by the previous key, so it needs no
new authorization (not implemented yet; see `ROADMAP.md`).

## Consequences

- Each device has a single chain for the whole rally.
- The organizer authorizes the raw public key (64 hex characters), and the
  server derives `deviceKeyId` from it. The server therefore holds every key
  before the first sync, and sync requests carry only records.
- Browsers evict a site's storage as a whole, so the key, the chain and any
  unsynced records are lost together, and the device then needs a new key and
  a new authorization. The app requests persistent storage at setup, and syncs
  as soon as there is signal.
