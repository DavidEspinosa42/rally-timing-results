import { defaultCache } from "@serwist/next/worker";
import {
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
} from "serwist";

// Built by `serwist build` into public/sw.js (see serwist.config.mjs) and
// type-checked by tsconfig.sw.json, with the worker's own globals.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Replaced with the precache manifest at build time.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  // A new version waits until every tab of the app is closed. Activating it
  // mid-entry would delete the previous build's precached files while the
  // open page still needs them.
  skipWaiting: false,
  // On the first install there is no previous version: take control at once,
  // so the page that installed the worker already works offline.
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Before defaultCache, which would cache GET /api/* and serve the copy
    // after a timeout: an old /api/health would look like a live server.
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
