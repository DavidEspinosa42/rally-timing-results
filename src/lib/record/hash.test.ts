import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize } from "@/lib/record/canonical";
import { fromHex, hashRecord, sha256Hex, toHex } from "@/lib/record/hash";
import { timeRecord } from "../../../test/fixtures";

describe("hex", () => {
  it("round-trips any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        expect(fromHex(toHex(bytes))).toEqual(bytes);
      }),
    );
  });

  it.each(["0", "AB", "zz", "0x00"])("rejects %j", (hex) => {
    expect(fromHex(hex)).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("matches the FIPS 180-2 test vector for 'abc'", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("hashRecord", () => {
  it("hashes the canonical text", async () => {
    const record = timeRecord();
    expect(await hashRecord(record)).toBe(
      await sha256Hex(new TextEncoder().encode(canonicalize(record))),
    );
  });

  it("changes when any field changes", async () => {
    const original = await hashRecord(timeRecord());
    expect(await hashRecord({ ...timeRecord(), carNumber: 9 })).not.toBe(
      original,
    );
  });
});
