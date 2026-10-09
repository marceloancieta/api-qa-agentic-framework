// Error envelopes: the shapes an API uses to report a failure. One API often has several, because
// the layer that rejects a request decides the format (framework validation vs a handler's own
// "not found"). Each service pack lists its envelopes by kind in error-envelopes.json; a negative
// case names the kind it expects and gets two separate verdicts:
//   shape   - status, content type and body schema of that kind, checked on every call;
//   meaning - which field was blamed, read from the envelope's field keys, never from message text.

import { readFileSync } from 'node:fs';
import type { APIResponse } from '@playwright/test';
import Ajv from 'ajv';

export interface EnvelopeKind {
  description: string;
  status: number[];
  /** Media type without parameters, e.g. `application/json`. */
  content_type: string;
  /** JSON Schema of the body; a non-JSON body is validated as a string. */
  schema: Record<string, unknown>;
  /** Paths that hold the blamed field, e.g. `field` or `errors[].field`. Empty: not reported. */
  field_paths: string[];
}

export interface EnvelopeCatalog {
  envelopes: Record<string, EnvelopeKind>;
}

export interface ObservedError {
  status: number;
  contentType: string;
  body: unknown;
}

export function loadEnvelopeCatalog(file: string): EnvelopeCatalog {
  return JSON.parse(readFileSync(file, 'utf8')) as EnvelopeCatalog;
}

const ajv = new Ajv({ allErrors: true, strict: false });

/** Values at a path such as `detail.field` or `errors[].field`. */
export function valuesAt(body: unknown, path: string): unknown[] {
  let current: unknown[] = [body];
  for (const part of path.split('.')) {
    const many = part.endsWith('[]');
    const key = many ? part.slice(0, -2) : part;
    current = current.flatMap((node) => {
      if (node === null || typeof node !== 'object') return [];
      const value = (node as Record<string, unknown>)[key];
      return many && Array.isArray(value) ? value : value === undefined ? [] : [value];
    });
  }
  return current;
}

// `photo_urls`, `photoUrls` and `body.PhotoUrls` all name the same field.
const comparable = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
function namesField(reported: unknown, field: string): boolean {
  if (typeof reported !== 'string') return false;
  const last =
    reported
      .split(/[.[\]/]/)
      .filter(Boolean)
      .pop() ?? reported;
  return comparable(last) === comparable(field) || comparable(reported) === comparable(field);
}

/** Every way `observed` differs from envelope `kind`; empty when it matches. */
export function checkErrorEnvelope(
  observed: ObservedError,
  kind: EnvelopeKind,
  field?: string,
): { shape: string[]; meaning: string[] } {
  const shape: string[] = [];
  const meaning: string[] = [];
  if (!kind.status.includes(observed.status)) {
    shape.push(`status ${observed.status}, expected ${kind.status.join(' or ')}`);
  }
  const mediaType = observed.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== kind.content_type.toLowerCase()) {
    shape.push(`content type "${mediaType || '(none)'}", expected "${kind.content_type}"`);
  }
  const validate = ajv.compile(kind.schema);
  if (!validate(observed.body)) {
    for (const error of validate.errors ?? []) {
      shape.push(`body ${error.instancePath || '(root)'} ${error.message ?? error.keyword}`);
    }
  }
  if (field !== undefined) {
    if (kind.field_paths.length === 0) {
      meaning.push(
        `this envelope does not report which field failed, so "${field}" cannot be asserted; ` +
          'assert the kind only, or record the missing field as a contract gap',
      );
    } else {
      const reported = kind.field_paths.flatMap((path) => valuesAt(observed.body, path));
      if (!reported.some((value) => namesField(value, field))) {
        meaning.push(`field "${field}" not reported; reported: ${JSON.stringify(reported)}`);
      }
    }
  }
  return { shape, meaning };
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Assert that `response` is an error of envelope `kindName` (and, when given, that it blames
 * `field`). Returns the parsed body for any further, case-specific assertion.
 */
export async function expectErrorEnvelope(
  response: APIResponse,
  catalog: EnvelopeCatalog,
  kindName: string,
  options: { field?: string } = {},
): Promise<unknown> {
  const kind = catalog.envelopes[kindName];
  if (!kind) {
    const known = Object.keys(catalog.envelopes).join(', ');
    throw new Error(`Unknown error envelope "${kindName}". Known: ${known}.`);
  }
  const body = parseBody(await response.text());
  const { shape, meaning } = checkErrorEnvelope(
    { status: response.status(), contentType: response.headers()['content-type'] ?? '', body },
    kind,
    options.field,
  );
  if (shape.length > 0 || meaning.length > 0) {
    const lines = [
      ...shape.map((problem) => `  shape: ${problem}`),
      ...meaning.map((problem) => `  meaning: ${problem}`),
    ];
    throw new Error(`Response is not a "${kindName}" error envelope:\n${lines.join('\n')}`);
  }
  return body;
}
