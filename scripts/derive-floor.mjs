// The minimum number of test cases each operation deserves, computed from the normalized model
// (CON-08). The script owns the number: case design and coverage reviews quote it instead of
// estimating, and every term is printed so a reviewer can audit where it comes from.
//
// Formula (defined here and nowhere else; a change to it starts in this comment):
//
//   floor = max(MINIMUM, positive + required + constraints + valueSets + pathParams
//                        + errors + body + security)
//
//   MINIMUM      2   at least one accepted and one rejected request per operation
//   positive     1   the documented happy path
//   required     one per required field a client may omit: required top-level body properties
//                (readOnly ones excluded) and required query, header and cookie parameters
//   constraints  one per declared limit on an input field (top-level body properties and every
//                parameter): lower bound (minimum / exclusiveMinimum), upper bound (maximum /
//                exclusiveMaximum), minLength, maxLength, pattern, minItems, maxItems, multipleOf;
//                a pattern that is itself a closed value set counts under valueSets instead
//   valueSets    one per input field restricted to a closed value set (enum, const, literal
//                alternation; on the field or on its array items), for a value outside the set
//   pathParams   one per path parameter, for an identifier that does not exist or is malformed
//   errors       one per declared 4xx/5xx response (explicit code or `4XX` range); 401 and 403 are
//                left to `security` when the operation is secured; `default` adds nothing, since
//                it promises no particular code
//   body         one when the request body is required, for a missing or malformed body
//   security     two when every security alternative needs credentials (none; invalid ones),
//                zero for an open operation or one that also allows anonymous access
//
// Input fields are read one level deep: nested objects belong to the schema's own builders and
// to the probe battery, and counting them here would make large payloads dominate the total.
//
// Usage:
//   node scripts/derive-floor.mjs [--service <pack> | --spec <file|url> | --live] [--json]

import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, objectShape, resolveSchema } from './lib/openapi.mjs';
import { parseCli, REPO_ROOT, resolveSpecSource } from './lib/cli.mjs';
import { closedSet, literalAlternatives } from './derive-value-sets.mjs';

export const MINIMUM = 2;
export const TERMS = [
  'positive',
  'required',
  'constraints',
  'valueSets',
  'pathParams',
  'errors',
  'body',
  'security',
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Each entry is one countable limit: any of its keywords present counts once.
const LIMITS = [
  ['minimum', 'exclusiveMinimum'],
  ['maximum', 'exclusiveMaximum'],
  ['minLength'],
  ['maxLength'],
  ['pattern'],
  ['minItems'],
  ['maxItems'],
  ['multipleOf'],
];

/** A schema with references followed and a nullable `anyOf: [X, null]` wrapper removed. */
function field(model, schema) {
  const resolved = resolveSchema(model, schema);
  if (isObject(resolved) && Array.isArray(resolved.anyOf)) {
    const others = resolved.anyOf.filter((member) => !(isObject(member) && member.type === 'null'));
    if (others.length === 1 && others.length < resolved.anyOf.length) {
      return resolveSchema(model, others[0]);
    }
  }
  return resolved;
}

/** Number of declared limits on one field schema. */
export function countLimits(schema) {
  if (!isObject(schema)) return 0;
  return LIMITS.filter((keywords) => {
    if (keywords[0] === 'pattern' && literalAlternatives(schema.pattern)) return false;
    return keywords.some((keyword) => keyword in schema);
  }).length;
}

/** True when the field, or each item of an array field, must come from a closed value set. */
export function hasValueSet(model, schema) {
  if (closedSet(schema)) return true;
  return isObject(schema) && schema.items !== undefined && !!closedSet(field(model, schema.items));
}

function bodyFields(model, requestBody) {
  if (!requestBody?.schema) return { fields: [], required: 0 };
  let schema = field(model, requestBody.schema);
  // An array body (a batch of records) is judged by its records.
  if (isObject(schema) && schema.items !== undefined && !schema.properties) {
    schema = field(model, schema.items);
  }
  const shape = objectShape(model, schema);
  const fields = Object.entries(shape.properties)
    .map(([name, child]) => ({ name, schema: field(model, child) }))
    .filter((entry) => !(isObject(entry.schema) && entry.schema.readOnly === true));
  const writable = new Set(fields.map((entry) => entry.name));
  return { fields, required: shape.required.filter((name) => writable.has(name)).length };
}

function isErrorStatus(status) {
  return /^[45](\d\d|XX)$/i.test(status);
}

/** The floor of one operation, with every term. */
export function operationFloor(model, operation) {
  const secured =
    operation.security.length > 0 && operation.security.every((alt) => alt.length > 0);
  const body = bodyFields(model, operation.requestBody);
  const parameters = operation.parameters.map((p) => ({ ...p, schema: field(model, p.schema) }));
  const inputs = [...body.fields.map((entry) => entry.schema), ...parameters.map((p) => p.schema)];

  const terms = {
    positive: 1,
    required: body.required + parameters.filter((p) => p.in !== 'path' && p.required).length,
    constraints: inputs.reduce((sum, schema) => sum + countLimits(schema), 0),
    valueSets: inputs.filter((schema) => hasValueSet(model, schema)).length,
    pathParams: parameters.filter((p) => p.in === 'path').length,
    errors: operation.responses.filter(
      (r) => isErrorStatus(r.status) && !(secured && (r.status === '401' || r.status === '403')),
    ).length,
    body: operation.requestBody?.required ? 1 : 0,
    security: secured ? 2 : 0,
  };
  const sum = TERMS.reduce((total, term) => total + terms[term], 0);
  return { key: operation.key, terms, sum, floor: Math.max(MINIMUM, sum) };
}

/** Floors of every operation in model order, and their total. */
export function deriveFloor(model) {
  const operations = model.operations.map((operation) => operationFloor(model, operation));
  return {
    minimum: MINIMUM,
    terms: TERMS,
    operations,
    total: operations.reduce((total, op) => total + op.floor, 0),
  };
}

const SHORT = {
  positive: 'pos',
  required: 'req',
  constraints: 'lim',
  valueSets: 'set',
  pathParams: 'path',
  errors: 'err',
  body: 'body',
  security: 'sec',
};

export function renderTable(result) {
  const header = ['operation', ...TERMS.map((term) => SHORT[term]), 'sum', 'floor'];
  const rows = result.operations.map((op) => [
    op.key,
    ...TERMS.map((term) => String(op.terms[term])),
    String(op.sum),
    String(op.floor),
  ]);
  const total = ['total', ...TERMS.map(() => ''), '', String(result.total)];
  const all = [header, ...rows, total];
  const widths = header.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const line = (cells) =>
    cells
      .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])))
      .join('  ')
      .trimEnd();
  const rule = line(widths.map((w) => '-'.repeat(w)));
  const legend = TERMS.map((term) => `${SHORT[term]}=${term}`).join(' ');
  return [
    line(header),
    rule,
    ...rows.map(line),
    rule,
    line(total),
    '',
    `${legend}; floor = max(${MINIMUM}, sum)`,
  ].join('\n');
}

async function main() {
  const values = parseCli({ json: { type: 'boolean', default: false } });
  const { source } = resolveSpecSource(values);
  const result = deriveFloor(await loadModel(source));
  const label = /^https?:\/\//i.test(source)
    ? source
    : relative(REPO_ROOT, resolve(source)).split('\\').join('/');
  if (values.json) console.log(JSON.stringify({ source: label, ...result }, null, 2));
  else console.log(`${label}\n\n${renderTable(result)}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
