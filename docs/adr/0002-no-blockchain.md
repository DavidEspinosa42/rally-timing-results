# 2. Tamper evidence without a blockchain

## Status

Accepted, 2026-10

## Context

An altered, deleted or reordered time must be detectable. Many controls have no
signal, so entries are made offline and synced later, and the organizer cannot
depend on a network or a third party during the event.

## Decision

Tamper evidence comes from two things on each device: an Ed25519 signature on
every record, and a per-device hash chain (`seq` plus `prevHash`, the hash of
the previous record). There is no blockchain or distributed ledger.

## Consequences

- It works fully offline; a record is protected from the moment it is saved.
- Anyone with the device's public key can verify a record and its chain.
- Altering a record, removing one from the middle of a chain, or reordering
  records is detectable. Dropping the newest records of a chain is not, unless
  the device's latest `seq` is known from another source.
- The server stores and serves records but cannot change them undetected.
