# 11. Builds and tests run offline

## Status

Accepted, 2026-11

## Context

The project is developed in a Linux sandbox with no internet: packages come
only from an npm mirror. `next/font/google` downloads its fonts from Google
Fonts during every build, so `npm run build` failed without a network. The
lockfile is generated on Windows, and the sandbox installs on Linux.

## Decision

- The two Atkinson Hyperlegible families are committed in `src/app/_fonts/`
  as the same latin-subset variable woff2 files Google Fonts served, with
  their SIL Open Font License texts, and loaded with `next/font/local`.
- Nothing the build, the tests or the app needs may come from the network:
  no Google Fonts, CDNs, remote images or install-time downloads.
- `.npmrc` never sets `registry`, so npm rewrites the lockfile's
  registry.npmjs.org URLs to whichever mirror the machine configures.
- The lockfile lists every platform's native package (Next.js SWC, Biome,
  rolldown, esbuild, lightningcss, Tailwind's oxide, sharp, TypeScript 7), so
  `npm ci` on Linux finds the Linux x64 builds.
- Next.js telemetry is off (`NEXT_TELEMETRY_DISABLED=1` in `.env.example`,
  which setup copies to `.env.local`; Next reads it before it starts
  telemetry), and so are its upgrade reminders, which query the npm
  registry's advisories on every `next dev` and `next build`
  (`experimental.agentUpgrade: false` in `next.config.ts`).

## Consequences

- With every Node.js network call blocked, none is attempted by typecheck,
  lint, the tests, the production build, `next dev`, `next start`, the
  database scripts or `device:authorize`, and they all pass.
- Next.js security releases are no longer announced during builds: check
  them with `npm audit` where there is a network.
- Updating the fonts is manual: download the new files and replace them.
- Text renders as before; the build no longer warns that it cannot find font
  override values.
