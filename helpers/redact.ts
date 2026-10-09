// Redaction for anything that becomes evidence. Two kinds of keys, matched by name at any depth,
// case-insensitively:
//   secrets  - credentials; the value is replaced by a fixed mask.
//   identity - values that are not secret but identify a person or another party's data (email,
//              phone, account id); the value is replaced by a stable pseudonym, so the same value
//              still correlates across one run's evidence without being readable.
// Secret key names have a built-in baseline; identity fields come from the service pack.

import { createHmac, randomBytes } from 'node:crypto';

export const MASK = '***';
export const SALT_VARIABLE = 'QA_ANON_SALT';

const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|credential|api[-_]?key/i;

export interface RedactionPolicy {
  /** Extra secret key names, e.g. a custom auth header. */
  secretKeys?: readonly string[];
  /** Keys whose values identify a party; pseudonymized rather than masked. */
  identityFields?: readonly string[];
}

// One salt per run: global setup puts it in the environment so workers share it. It is never
// printed, so a pseudonym of a short value (a phone number) cannot be reversed by trying them all.
let fallbackSalt: string | undefined;
function salt(): string {
  const fromEnv = process.env[SALT_VARIABLE];
  if (fromEnv) return fromEnv;
  fallbackSalt ??= randomBytes(16).toString('hex');
  return fallbackSalt;
}

/** A stable, non-reversible stand-in for `value` within one run. */
export function pseudonym(value: unknown): string {
  const digest = createHmac('sha256', salt()).update(String(value)).digest('hex');
  return `anon:${digest.slice(0, 12)}`;
}

function lowered(keys: readonly string[] = []): ReadonlySet<string> {
  return new Set(keys.map((key) => key.toLowerCase()));
}

type Treatment = 'secret' | 'identity' | 'keep';

function classifier(policy: RedactionPolicy): (key: string) => Treatment {
  const secrets = lowered(policy.secretKeys);
  const identities = lowered(policy.identityFields);
  return (key) => {
    const name = key.toLowerCase();
    if (SECRET_KEY.test(key) || secrets.has(name)) return 'secret';
    if (identities.has(name)) return 'identity';
    return 'keep';
  };
}

/** A deep copy of `value` with secrets masked and identity values pseudonymized. */
export function redact(value: unknown, policy: RedactionPolicy = {}): unknown {
  const classify = classifier(policy);
  const walk = (node: unknown, treatment: Treatment): unknown => {
    if (treatment === 'secret') return MASK;
    if (Array.isArray(node)) return node.map((item) => walk(item, treatment));
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => {
          const own = classify(key);
          return [key, walk(child, own === 'keep' ? treatment : own)];
        }),
      );
    }
    return treatment === 'identity' && node !== null ? pseudonym(node) : node;
  };
  return walk(value, 'keep');
}

/** `url` with sensitive query values redacted the same way. Unparseable input comes back as is. */
export function redactUrl(url: string, policy: RedactionPolicy = {}): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const classify = classifier(policy);
  for (const key of [...parsed.searchParams.keys()]) {
    const treatment = classify(key);
    if (treatment === 'secret') parsed.searchParams.set(key, MASK);
    if (treatment === 'identity') {
      parsed.searchParams.set(key, pseudonym(parsed.searchParams.get(key)));
    }
  }
  return parsed.toString();
}
