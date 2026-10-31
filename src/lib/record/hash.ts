import { canonicalBytes } from "./canonical";
import type { RecordV1 } from "./types";

const HEX = /^(?:[0-9a-f]{2})*$/;

/** Lowercase hex, the encoding of every hash, key id and signature here. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Decodes lowercase hex, or returns null for anything else. */
export function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!HEX.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/** SHA-256 of the record's canonical bytes: its identity in the chain. */
export function hashRecord(record: RecordV1): Promise<string> {
  return sha256Hex(canonicalBytes(record));
}
