# 7. Serwist in configurator mode

## Status

Accepted, 2026-10

## Context

The entry screen must open and accept entries with no connection, so a service
worker has to precache the app's prerendered routes, including an offline
fallback page. Next.js builds with Turbopack.

## Decision

The service worker is built with Serwist in configurator mode (`@serwist/next`
with `@serwist/cli`), rather than `@serwist/turbopack` or Serwist's classic
webpack plugin. `serwist build` runs after `next build` and bundles
`src/app/sw.ts` into `public/sw.js`.

## Consequences

- The build stays on Turbopack (no `--webpack`), and the prerendered routes
  are precached without listing them by hand.
- The production build is `next build && serwist build`. The worker is
  disabled in development, so offline behavior is tested only on a production
  build.
