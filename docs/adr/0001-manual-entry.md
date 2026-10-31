# 1. Manual entry of timing readings

## Status

Accepted, 2026-10

## Context

Clubs already own timing equipment: stopwatches, official clocks, photocells
with printing clocks, or a hired timing service. What is missing is a reliable
path from each control to the results; today the times travel on paper time
cards and check sheets. The main risk on that path is transcription error, not
clock precision.

## Decision

The app never measures time. A marshal types the car number and the reading
shown by the event's timing equipment, and the app records it with its
`precision` and `source`. The device clock only provides `enteredAtMs`, an
audit timestamp of when the entry was made.

## Consequences

- The app works on top of any timing system instead of competing with it.
- Checks on what was typed (readback before confirming, and later double entry
  and outlier detection) matter more than clock accuracy.
- A record is only as accurate as the equipment and the marshal. Its signature
  proves who entered which value and that nobody changed it since, not that the
  reading was right.
