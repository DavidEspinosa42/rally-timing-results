"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active`. The browser drops the lock whenever
 * the page is hidden, so it is taken again when the page is visible. A route
 * left behind stays mounted but hidden in an <Activity>, which runs this
 * effect's cleanup, so the lock never outlives the entry screen.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    async function acquire() {
      if (stopped || document.visibilityState !== "visible") return;
      if (sentinel !== null && !sentinel.released) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) await lock.release();
        else sentinel = lock;
      } catch {
        // Refused, for example in battery saver: the screen may dim.
      }
    }

    const onVisibility = () => {
      void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [active]);
}
