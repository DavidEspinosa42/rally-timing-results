import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalize } from "@/lib/record/canonical";
import { fromHex } from "@/lib/record/hash";
import {
  publicKeyId,
  type SignedRecord,
  signRecord,
  verifyRecord,
} from "@/lib/record/sign";
import type { RecordV1, TimeRecord } from "@/lib/record/types";
import { IDS, timeRecord } from "../../../test/fixtures";

const ED25519 = { name: "Ed25519" } as const;

function newKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ED25519, false, ["sign", "verify"]);
}

let keys: CryptoKeyPair;
let other: CryptoKeyPair;
let record: TimeRecord;
let signed: SignedRecord;

beforeAll(async () => {
  [keys, other] = await Promise.all([newKeyPair(), newKeyPair()]);
  record = { ...timeRecord(), deviceKeyId: await publicKeyId(keys.publicKey) };
  signed = await signRecord(record, keys.privateKey);
});

/** The same signature and hash over a payload re-encoded from `changed`. */
const withPayload = (changed: RecordV1): SignedRecord => ({
  ...signed,
  payload: canonicalize(changed),
});

describe("signRecord", () => {
  it("signs the canonical payload and verifies with the same device key", async () => {
    expect(signed.payload).toBe(canonicalize(record));
    expect(signed.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(await verifyRecord(signed, keys.publicKey)).toEqual({
      ok: true,
      record,
      hash: signed.hash,
    });
  });

  it("refuses to sign an invalid record", async () => {
    const invalid = { ...record, carNumber: 0 };
    await expect(signRecord(invalid, keys.privateKey)).rejects.toThrow();
  });

  it("refuses to sign another schema version", async () => {
    // The type forbids this; the test is that the runtime check does too.
    const v2 = {
      ...record,
      schema: "rally-timing-results/record/v2",
    } as unknown as RecordV1;
    await expect(signRecord(v2, keys.privateKey)).rejects.toThrow();
  });
});

describe("verifyRecord", () => {
  it.each<[string, Partial<TimeRecord>]>([
    ["carNumber", { carNumber: 9 }],
    ["timeOfDayMs", { timeOfDayMs: 54_372_500 }],
    ["point", { point: "START" }],
    ["precision", { precision: "MS" }],
    ["source", { source: "STOPWATCH" }],
    ["sourceRole", { sourceRole: "BACKUP" }],
    ["stageId", { stageId: IDS.otherRecord }],
    ["sectionId", { sectionId: IDS.otherRecord }],
    ["rallyId", { rallyId: IDS.otherRecord }],
    ["recordId", { recordId: IDS.otherRecord }],
    ["seq and prevHash", { seq: 1, prevHash: "cd".repeat(32) }],
    ["enteredAtMs", { enteredAtMs: timeRecord().enteredAtMs + 1 }],
  ])("fails when %s is altered", async (_field, change) => {
    const altered = withPayload({ ...record, ...change });
    expect(await verifyRecord(altered, keys.publicKey)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails when any character of the payload is altered", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat(),
        fc.string({ minLength: 1, maxLength: 1 }),
        async (index, replacement) => {
          const at = index % signed.payload.length;
          fc.pre(signed.payload[at] !== replacement);
          const payload =
            signed.payload.slice(0, at) +
            replacement +
            signed.payload.slice(at + 1);
          const result = await verifyRecord(
            { ...signed, payload },
            keys.publicKey,
          );
          expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("fails with another device's key", async () => {
    expect(await verifyRecord(signed, other.publicKey)).toEqual({
      ok: false,
      reason: "key-mismatch",
    });
  });

  it("fails when a record claims another device's key", async () => {
    const claimed = {
      ...record,
      deviceKeyId: await publicKeyId(other.publicKey),
    };
    const forged = await signRecord(claimed, keys.privateKey);
    expect(await verifyRecord(forged, other.publicKey)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("fails when the schema is changed to another version", async () => {
    const payload = signed.payload.replace(
      "rally-timing-results/record/v1",
      "rally-timing-results/record/v2",
    );
    expect(await verifyRecord({ ...signed, payload }, keys.publicKey)).toEqual({
      ok: false,
      reason: "invalid-record",
    });
  });

  it("fails on a payload that is not canonical", async () => {
    const payload = JSON.stringify(record, null, 1);
    expect(await verifyRecord({ ...signed, payload }, keys.publicKey)).toEqual({
      ok: false,
      reason: "not-canonical",
    });
  });

  it.each([
    ["truncated", () => signed.signature.slice(0, -2)],
    ["not hex", () => "zz".repeat(64)],
    ["another record's", () => "00".repeat(64)],
  ])("fails with a %s signature", async (_label, signature) => {
    expect(
      await verifyRecord({ ...signed, signature: signature() }, keys.publicKey),
    ).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("fails when the stated hash is wrong", async () => {
    expect(
      await verifyRecord({ ...signed, hash: "00".repeat(32) }, keys.publicKey),
    ).toEqual({ ok: false, reason: "hash-mismatch" });
  });
});

describe("Ed25519 on this platform", () => {
  // RFC 8032, section 7.1, TEST 1 (empty message): an independent verifier
  // using any standard Ed25519 library accepts these records.
  it("verifies the RFC 8032 test vector", async () => {
    const hex = (value: string) => {
      const bytes = fromHex(value);
      if (bytes === null) throw new Error("bad test vector");
      return bytes;
    };
    const publicKey = await crypto.subtle.importKey(
      "raw",
      hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"),
      ED25519,
      true,
      ["verify"],
    );
    const signature = hex(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    );
    expect(
      await crypto.subtle.verify(
        ED25519,
        publicKey,
        signature,
        new Uint8Array(0),
      ),
    ).toBe(true);
  });
});
