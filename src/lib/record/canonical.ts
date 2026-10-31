// Canonical JSON for flat records: a subset of RFC 8785 (JCS). Records only
// hold strings, safe integers and null, which keeps the encoding simple:
// keys sorted by UTF-16 code units, strings as JSON.stringify writes them,
// integers in plain decimal, and no whitespace. Anything else is refused
// rather than guessed at, because the signature covers these exact bytes.

export type CanonicalValue = string | number | null;
export type CanonicalObject = Readonly<Record<string, CanonicalValue>>;

function encodeValue(key: string, value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (!value.isWellFormed()) {
      throw new TypeError(`${key}: string is not well-formed Unicode`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${key}: only safe integers are allowed`);
    }
    return String(value);
  }
  throw new TypeError(`${key}: unsupported value of type ${typeof value}`);
}

/** The canonical JSON text of a flat record. Throws on anything else. */
export function canonicalize(record: CanonicalObject): string {
  const keys = Object.keys(record).sort();
  const members = keys.map((key) => {
    if (!key.isWellFormed()) {
      throw new TypeError("key is not well-formed Unicode");
    }
    return `${JSON.stringify(key)}:${encodeValue(key, record[key])}`;
  });
  return `{${members.join(",")}}`;
}

/** The UTF-8 bytes that are hashed and signed. */
export function canonicalBytes(
  record: CanonicalObject,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalize(record));
}

/**
 * Parses text that must already be canonical. Returns null if it is not
 * JSON, not a flat record, or not byte-for-byte canonical (other key order,
 * whitespace, duplicate keys, `1e3`, escapes written differently…).
 */
export function parseCanonical(text: string): CanonicalObject | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  try {
    // Values are checked by canonicalize; a nested value makes it throw.
    const record = parsed as CanonicalObject;
    return canonicalize(record) === text ? record : null;
  } catch {
    return null;
  }
}
