import "client-only";

// Next.js supports Safari 16.4+, but Ed25519 in WebCrypto needs Safari 17+
// (Chrome 137+, Firefox 129+), so support is checked at startup rather than
// assumed. WebCrypto and service workers also need a secure context.

export type Missing = "secure-context" | "indexeddb" | "ed25519";

export type Support = { supported: boolean; missing: Missing[] };

async function hasEd25519(): Promise<boolean> {
  // crypto.subtle is undefined outside a secure context.
  if (typeof crypto?.subtle?.generateKey !== "function") return false;
  try {
    await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
      "sign",
      "verify",
    ]);
    return true;
  } catch {
    return false;
  }
}

/** What this browser lacks for the app to work, if anything. */
export async function checkSupport(): Promise<Support> {
  const missing: Missing[] = [];
  if (globalThis.isSecureContext !== true) missing.push("secure-context");
  if (typeof globalThis.indexedDB === "undefined") missing.push("indexeddb");
  if (!(await hasEd25519())) missing.push("ed25519");
  return { supported: missing.length === 0, missing };
}

/**
 * "persistent": the browser will not clear this site's storage on its own.
 * "best-effort": it may, under storage pressure or (Safari, in a tab) after
 * 7 days without a visit. "unknown": the browser cannot say.
 */
export type Persistence = "persistent" | "best-effort" | "unknown";

function storageManager(): StorageManager | undefined {
  return globalThis.navigator?.storage;
}

export async function storagePersistence(): Promise<Persistence> {
  const storage = storageManager();
  if (typeof storage?.persisted !== "function") return "unknown";
  return (await storage.persisted()) ? "persistent" : "best-effort";
}

/**
 * Asks the browser to keep this site's storage. Call it only from a tap:
 * Firefox shows a prompt, while Chrome and Safari decide by their own
 * heuristics (Safari mostly grants it to Home Screen apps).
 */
export async function requestPersistence(): Promise<Persistence> {
  const storage = storageManager();
  if (typeof storage?.persist !== "function") return "unknown";
  return (await storage.persist()) ? "persistent" : "best-effort";
}
