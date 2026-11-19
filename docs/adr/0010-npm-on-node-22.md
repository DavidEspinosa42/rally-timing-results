# 10. npm on Node.js 22.13 or later

## Status

Accepted, 2026-11. Replaces pnpm 12 on Node.js 26.

## Context

The project moved to npm and Node.js 22 as part of becoming
rally-timing-results. pnpm had provided controls that npm 10.9 does not have:

- `minimumReleaseAge`: no version younger than a day was ever installed.
- `trustPolicy: no-downgrade`: an install failed if a package's publishing
  trust level dropped from one version to the next.
- `devEngines.runtime` with `onFail: download`: pnpm fetched the pinned
  Node.js itself.

Node.js 22.13.0 is the lowest 22.x that every dependency supports. Below it,
`@inquirer/prompts` (loaded by every `@serwist/cli` command, `serwist build`
included) and vitest 5 are outside their `engines`. The only `@serwist/cli`
that supports 22.12 is 9.2.1, which has no `serwist build` and so no
configurator mode (ADR 7).

## Decision

- `devEngines` in `package.json` asks for Node.js `>=22.13.0` and npm
  `>=10.9.0` with `onFail: warn`: a machine or sandbox with a different
  version still installs and runs, with a warning only when it is older.
  CI runs on exactly 22.13.0, the oldest supported version.
- `.npmrc` sets `save-exact=true` (pnpm's `saveExact`) and
  `ignore-scripts=true` (pnpm built no dependency either).
- Every version in `package-lock.json`, direct and transitive, is at least
  7 days old: installs and updates pass `--before` a date 7 days back. The
  lockfile is the guarantee, since `npm ci` installs only what it lists, and
  a registry cache that holds only versions that old can serve it. npm 11's
  rolling `min-release-age` was not adopted, to stay on npm 10. 7 days, not
  30, keeps security releases in reach: at 30 the Next.js 16.4.6 fix would
  have been blocked.
- CI installs with `npm ci`, from the lockfile only.

## Consequences

- There is no trust-level check on updates, and nothing enforces the 7-day
  age automatically; it is checked by hand against the registry's publish
  times.
- npm 10.9.2 crashes (`Cannot read properties of null (reading
  'edgesOut')`) when it re-resolves the whole tree with `--before`, in its
  optional-peer handling. Update from the existing lockfile instead: remove
  only the entries that are too new, then run `npm install --before …`.
- npm prefers versions whose `engines` match the Node.js it runs on, so the
  lockfile holds versions that support 22.13 (for example `@inquirer/core`
  12.0.6, not 12.1.0, which needs 22.22.2). Updating dependencies on a newer
  Node.js can lock versions that drop 22.13; check `engines` after updates.
- Vite is a direct, pinned devDependency (8.x, which supports 22.12 and up)
  rather than left to npm as vitest's peer: on an older Node.js, npm picks
  Vite 6, which cannot read tsconfig `paths` (`resolve.tsconfigPaths` in
  `vitest.config.mts`).
- WebCrypto Ed25519, which signs and verifies every record, is no longer
  marked experimental from Node.js 22.13.
