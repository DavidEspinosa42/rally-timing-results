# 3. Ed25519 through WebCrypto with non-extractable keys

## Status

Accepted, 2026-10

## Context

Each device signs records offline. Its private key must not be copyable, and
the server must verify signatures with the same code the client uses.

## Decision

Records are signed with Ed25519 through WebCrypto (`crypto.subtle`). Keys are
generated with `extractable: false` and stored as `CryptoKey` objects in
IndexedDB. The same signing and verification code runs in the browser and on
the server.

## Consequences

- No cryptography dependency; the private key cannot be exported, logged or
  sent, even by the app itself.
- Ed25519 needs Chrome 137+, Firefox 129+ or Safari 17+. Next.js targets
  Safari 16.4+, so the app checks for Ed25519 at startup and shows "This
  browser is not supported" when it is missing.
- WebCrypto only exists in a secure context (HTTPS or `localhost`), so phones
  testing over the LAN need HTTPS.
