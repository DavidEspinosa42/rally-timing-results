import { canonicalize, parseCanonical } from "./canonical";
import { fromHex, sha256Hex, toHex } from "./hash";
import { type RecordV1, recordV1Schema } from "./types";

const ED25519 = { name: "Ed25519" } as const;
const SIGNATURE_BYTES = 64;

/**
 * A record as it is stored and sent: the canonical JSON text that was signed,
 * its SHA-256, and the Ed25519 signature over the same bytes. `payload` is
 * the evidence; never rebuild it from parsed fields.
 */
export type SignedRecord = {
  payload: string;
  hash: string;
  signature: string;
};

export type VerifyFailure =
  | "not-canonical"
  | "invalid-record"
  | "key-mismatch"
  | "bad-signature"
  | "hash-mismatch";

export type Verification =
  | { ok: true; record: RecordV1; hash: string }
  | { ok: false; reason: VerifyFailure };

/** The device key id: SHA-256 of the raw 32-byte Ed25519 public key. */
export async function publicKeyId(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return sha256Hex(new Uint8Array(raw));
}

/** Validates the record, then signs its canonical bytes. */
export async function signRecord(
  record: RecordV1,
  privateKey: CryptoKey,
): Promise<SignedRecord> {
  const payload = canonicalize(recordV1Schema.parse(record));
  const bytes = new TextEncoder().encode(payload);
  const [hash, signature] = await Promise.all([
    sha256Hex(bytes),
    crypto.subtle.sign(ED25519, privateKey, bytes),
  ]);
  return { payload, hash, signature: toHex(new Uint8Array(signature)) };
}

/**
 * Checks, in order: the payload is canonical, it is a valid v1 record, it
 * names this key, the signature matches, and the stated hash matches.
 */
export async function verifyRecord(
  signed: SignedRecord,
  publicKey: CryptoKey,
): Promise<Verification> {
  const fields = parseCanonical(signed.payload);
  if (fields === null) return { ok: false, reason: "not-canonical" };

  const parsed = recordV1Schema.safeParse(fields);
  if (!parsed.success) return { ok: false, reason: "invalid-record" };
  const record = parsed.data;

  if (record.deviceKeyId !== (await publicKeyId(publicKey))) {
    return { ok: false, reason: "key-mismatch" };
  }

  const signature = fromHex(signed.signature);
  const bytes = new TextEncoder().encode(signed.payload);
  if (
    signature === null ||
    signature.length !== SIGNATURE_BYTES ||
    !(await crypto.subtle.verify(ED25519, publicKey, signature, bytes))
  ) {
    return { ok: false, reason: "bad-signature" };
  }

  const hash = await sha256Hex(bytes);
  if (hash !== signed.hash) return { ok: false, reason: "hash-mismatch" };

  return { ok: true, record, hash };
}
