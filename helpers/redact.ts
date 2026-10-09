// Masking for anything that becomes evidence. Keys are matched by name, case-insensitively, at any
// depth. This is the baseline; identity fields and anonymization helpers extend it (CORE-08).

export const MASK = '***';

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|credential|api[-_]?key/i;

function isSensitive(key: string, extraKeys: ReadonlySet<string>): boolean {
  return SENSITIVE_KEY.test(key) || extraKeys.has(key.toLowerCase());
}

/** A deep copy of `value` with every sensitive key's value replaced by the mask. */
export function redact(value: unknown, extraKeys: readonly string[] = []): unknown {
  const extra = new Set(extraKeys.map((key) => key.toLowerCase()));
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        isSensitive(key, extra) ? MASK : walk(child),
      ]),
    );
  };
  return walk(value);
}

/** `url` with the values of sensitive query parameters masked. Unparseable input comes back as is. */
export function redactUrl(url: string, extraKeys: readonly string[] = []): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const extra = new Set(extraKeys.map((key) => key.toLowerCase()));
  for (const key of [...parsed.searchParams.keys()]) {
    if (isSensitive(key, extra)) parsed.searchParams.set(key, MASK);
  }
  return parsed.toString();
}
