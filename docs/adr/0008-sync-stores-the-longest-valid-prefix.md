# 8. Sync stores the longest valid prefix of a batch

## Status

Accepted, 2026-10

## Context

A phone sends its records in batches of up to 500, in chain order, often
after hours without signal. Each record links to the one before it, so a
record the server refuses (for example, one entered for a point the device is
no longer granted) means every later record of that device cannot be chained
either. Rejecting the whole batch would throw away the good records before
it; accepting records out of order would break the chain.

## Decision

`POST /api/sync` checks the records in order and stores every one up to the
first that fails: its format, its signature, the device's grants, then its
place in the chain. It answers with how many it accepted, the device's
latest stored record (`head`), and why it stopped (`rejected`), if it did.
Records already stored with the same hash count as accepted, so a resend
after a lost answer is harmless.

The phone keeps no "synced" flag on its records. It keeps one pointer per
device key, the `seq` of the server's `head`, and treats every record above
it as waiting. It moves the pointer only to a `head` that matches its own
record at that position.

## Consequences

- A partial sync is never lost: the accepted records stay accepted, and the
  rest wait on the phone.
- A refused record holds back the later records of the same device until the
  cause is fixed (usually by the organizer, for example by granting the
  point again). The entry screen shows the reason, and the records stay on
  the phone, unchanged.
- The phone's records stay append-only, like the server's. If the server
  loses records, its `head` moves back and the phone sends them again.
