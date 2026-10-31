import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkSupport,
  requestPersistence,
  storagePersistence,
} from "@/lib/client/support";
import { newBrowserProfile } from "../../../test/local-db";

/** A browser with everything the app needs. */
function modernBrowser() {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("indexedDB", newBrowserProfile());
}

function storage(persisted: boolean, grants: boolean) {
  const manager = {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => grants),
  };
  vi.stubGlobal("navigator", { storage: manager });
  return manager;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkSupport", () => {
  it("passes a browser with a secure context, IndexedDB and Ed25519", async () => {
    modernBrowser();
    expect(await checkSupport()).toEqual({ supported: true, missing: [] });
  });

  it("reports a page served over plain HTTP", async () => {
    modernBrowser();
    vi.stubGlobal("isSecureContext", false);
    expect(await checkSupport()).toMatchObject({
      supported: false,
      missing: ["secure-context"],
    });
  });

  it("reports a browser without IndexedDB", async () => {
    modernBrowser();
    vi.stubGlobal("indexedDB", undefined);
    expect((await checkSupport()).missing).toEqual(["indexeddb"]);
  });

  it("reports a browser without Ed25519, such as Safari 16", async () => {
    modernBrowser();
    vi.spyOn(crypto.subtle, "generateKey").mockRejectedValue(
      new DOMException("Unrecognized name", "NotSupportedError"),
    );
    expect((await checkSupport()).missing).toEqual(["ed25519"]);
  });
});

describe("storage persistence", () => {
  it("reports storage the browser has agreed to keep", async () => {
    storage(true, true);
    expect(await storagePersistence()).toBe("persistent");
  });

  it("reports storage the browser may clear", async () => {
    storage(false, false);
    expect(await storagePersistence()).toBe("best-effort");
  });

  it("asks the browser to keep storage only when requested", async () => {
    const manager = storage(false, true);
    await storagePersistence();
    expect(manager.persist).not.toHaveBeenCalled();
    expect(await requestPersistence()).toBe("persistent");
    expect(manager.persist).toHaveBeenCalledOnce();
  });

  it("reports a refusal", async () => {
    storage(false, false);
    expect(await requestPersistence()).toBe("best-effort");
  });

  it("is unknown where the Storage API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await storagePersistence()).toBe("unknown");
    expect(await requestPersistence()).toBe("unknown");
  });
});
