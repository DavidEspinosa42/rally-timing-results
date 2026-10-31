import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CanonicalObject,
  canonicalBytes,
  canonicalize,
  parseCanonical,
} from "@/lib/record/canonical";
import { timeRecord } from "../../../test/fixtures";

describe("canonicalize", () => {
  it("sorts keys and writes no whitespace", () => {
    expect(canonicalize({ b: 1, a: "x", c: null })).toBe(
      '{"a":"x","b":1,"c":null}',
    );
  });

  it("sorts by UTF-16 code units, not by locale", () => {
    expect(canonicalize({ b: 1, B: 2, á: 3, "10": 4, "9": 5 })).toBe(
      '{"10":4,"9":5,"B":2,"b":1,"á":3}',
    );
  });

  it("writes strings the way JSON.stringify does", () => {
    expect(canonicalize({ s: 'Cómputos "CH4"\\\n\u0001' })).toBe(
      String.raw`{"s":"Cómputos \"CH4\"\\\n\u0001"}`,
    );
  });

  it("writes integers in plain decimal", () => {
    expect(canonicalize({ n: 1_790_000_000_000, z: -0, m: -5 })).toBe(
      '{"m":-5,"n":1790000000000,"z":0}',
    );
  });

  it.each<[string, unknown]>([
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an unsafe integer", 2 ** 53],
    ["a boolean", true],
    ["undefined", undefined],
    ["a nested object", { a: 1 }],
    ["an array", [1]],
    ["a lone surrogate", "\ud800"],
  ])("refuses %s", (_label, value) => {
    expect(() => canonicalize({ v: value } as CanonicalObject)).toThrow(
      TypeError,
    );
  });

  it("encodes the canonical text as UTF-8", () => {
    expect(Array.from(canonicalBytes({ s: "ó" }))).toEqual([
      ...new TextEncoder().encode('{"s":"ó"}'),
    ]);
  });

  it("does not depend on the order fields were set in", () => {
    const record = timeRecord();
    const reversed = Object.fromEntries(Object.entries(record).reverse());
    expect(canonicalize(reversed)).toBe(canonicalize(record));
  });
});

describe("parseCanonical", () => {
  const flatRecord = fc.dictionary(
    fc.string(),
    fc.oneof(fc.string(), fc.maxSafeInteger(), fc.constant(null)),
  );

  it("reads back what canonicalize writes", () => {
    fc.assert(
      fc.property(flatRecord, (record) => {
        expect(parseCanonical(canonicalize(record))).toEqual(record);
      }),
    );
  });

  it.each([
    ["other key order", '{"b":1,"a":2}'],
    ["whitespace", '{"a": 1}'],
    ["a duplicate key", '{"a":1,"a":1}'],
    ["an exponent", '{"a":1e3}'],
    ["a needless escape", '{"a":"\\u0041"}'],
    ["a nested value", '{"a":{"b":1}}'],
    ["a boolean", '{"a":true}'],
    ["an array", "[1]"],
    ["a bare value", "1"],
    ["invalid JSON", "{"],
  ])("rejects %s", (_label, text) => {
    expect(parseCanonical(text)).toBeNull();
  });
});
