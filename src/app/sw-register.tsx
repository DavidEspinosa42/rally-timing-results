"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only. This replaces
 * Serwist's SerwistProvider, whose defaults reload the page on every
 * `online` event and patch history.pushState: neither belongs on a screen
 * where a marshal may be halfway through an entry.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // A classic script: `serwist build` bundles everything into one file.
    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        type: "classic",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        console.warn("service worker not registered:", error);
      });
  }, []);
  return null;
}
