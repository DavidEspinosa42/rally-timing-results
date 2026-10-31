import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("resolves server-only to an empty module", async () => {
    const mod = await import("server-only");
    expect(Object.keys(mod)).toEqual([]);
  });

  it("runs fast-check properties", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), (n) => {
        expect(Number.parseInt(String(n), 10)).toBe(n);
      }),
    );
  });
});
