// Credential detection and masking used by secret-guard.mjs.
//
// Two levels of confidence:
//   KNOWN_FORMATS   documented token formats (cloud keys, JWT, PEM headers, vendor prefixes) plus
//                   `NAME_TOKEN=<value>` assignments with a realistic value. Precise enough to refuse
//                   any tool call that contains one.
//   NAMED_VALUES    a secret-sounding name followed by a value (`password: "x"`, connection strings).
//                   Too broad to refuse local edits, so it is only used for prompts, outbound content
//                   and output masking.
// Output masking additionally catches long random-looking strings that carry no name at all.

/** Words that mark a variable or key as secret. Shared with secret-guard's shell checks. */
export const SECRET_NAME_WORDS =
  'PASSWORD|PASSWD|PWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL';

const KNOWN_FORMATS = [
  ['an AWS access key id', /(?:AKIA|ASIA)[0-9A-Z]{16}/],
  ['an AWS secret key assignment', /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/i],
  ['a JSON Web Token', /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/],
  ['a private key header', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['a bearer token', /\bbearer\s+[\w\-.~+/]{20,}=*/i],
  ['a GitHub token', /\b(?:gh[opsur]_[A-Za-z0-9]{36,}|github_pat_\w{30,})/],
  ['a Slack token', /xox[abprs]-[0-9A-Za-z-]{10,}/],
  ['an API key with an sk- prefix', /\bsk-[\w-]{20,}/],
];

// `NAME_TOKEN = value`, where NAME contains a secret word (PWD excluded: it is the shell's working
// directory variable, and its values are paths).
const SECRET_ASSIGNMENT = new RegExp(
  String.raw`\b\w*(?:${SECRET_NAME_WORDS.replace('|PWD', '')})\w*\s*[:=]\s*['"]?([^\s'"]{12,})`,
  'gi',
);
const PLACEHOLDER_VALUE =
  /^(?:your|example|sample|placeholder|dummy|fake|test|changeme|redacted|todo|none|null|x{3,}|<.*>|\$\{.*\}|\$\()/i;

const NAMED_VALUES = [
  // A secret-sounding key, then either a quoted value or a bare word that ends the token and holds
  // no code punctuation (so `token = client.get()` and `password = cfg[k]` are ignored).
  /(?:password|pwd|secret|token|api[_-]?key)['"]?\s*[:=]\s*(?:['"][^'"\s]{4,}['"]|[^\s'".()[\]{}<>:;,$]{4,}(?=[\s'";,)]|$))/gi,
  /connection[_-]?string['"]?\s*[:=]\s*['"]?[^'"]+/gi,
  /\b(?:server|data source)\s*=\s*[^;'"]+;[^'"]*(?:password|pwd)\s*=/gi,
];

/** True when an assigned value is realistic: not a placeholder, 12+ token characters, mixed case or digits. */
function isRealisticValue(value) {
  if (!/^[\w+/=-]{12,}$/.test(value) || PLACEHOLDER_VALUE.test(value)) return false;
  return [/[a-z]/, /[A-Z]/, /\d/].filter((re) => re.test(value)).length >= 2;
}

/** Descriptions of every known credential format present in `text`. */
export function findCredentials(text) {
  if (!text) return [];
  const found = KNOWN_FORMATS.filter(([, re]) => re.test(text)).map(([what]) => what);
  for (const [whole, value] of text.matchAll(SECRET_ASSIGNMENT)) {
    if (isRealisticValue(value)) found.push(`a secret assignment (${whole.slice(0, 40)}...)`);
  }
  return [...new Set(found)];
}

function hasNamedValue(text) {
  return NAMED_VALUES.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Either confidence level. */
export function hasAnySecret(text) {
  return Boolean(text) && (findCredentials(text).length > 0 || hasNamedValue(text));
}

// Random-looking strings without a name. Path separators, `-` and `_` split words, so file paths and
// identifiers break into short pieces; a generated secret is a single long run.
const LONG_RUN = /[A-Za-z0-9+=]{24,}/g;

function entropyBits(s) {
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  return Object.values(freq).reduce(
    (bits, n) => bits - (n / s.length) * Math.log2(n / s.length),
    0,
  );
}

/** Mixed case, at least 10% digits and high entropy. Hex digests (no upper case) never qualify. */
function looksGenerated(run) {
  const digitShare = run.replace(/\D/g, '').length / run.length;
  return /[a-z]/.test(run) && /[A-Z]/.test(run) && digitShare >= 0.1 && entropyBits(run) >= 4;
}

export const MASK = '[masked secret]';

export function redact(text) {
  if (typeof text !== 'string' || !text) return text;
  let masked = text;
  for (const [, re] of KNOWN_FORMATS)
    masked = masked.replace(new RegExp(re.source, `${re.flags}g`), MASK);
  for (const re of NAMED_VALUES) masked = masked.replace(re, MASK);
  return masked.replace(LONG_RUN, (run) => (looksGenerated(run) ? MASK : run));
}

/** Mask every string inside a JSON-like value, keeping its shape. */
export function redactValue(value) {
  if (value === undefined) return value;
  // A JSON round trip visits every nested string through the reviver; tool payloads are plain JSON.
  return JSON.parse(JSON.stringify(value), (_key, item) =>
    typeof item === 'string' ? redact(item) : item,
  );
}
