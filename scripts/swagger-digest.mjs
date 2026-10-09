#!/usr/bin/env node
/**
 * A compact, deterministic fingerprint of an API description, kept in git so that a contract change
 * becomes a reviewable diff instead of a surprise in a failing test.
 *
 * The digest is built from the normalized model (ADR 0003), so Swagger 2.0, OpenAPI 3.0 and 3.1
 * descriptions of the same API produce the same digest. It records every constrained element, not
 * only body properties (L-29): parameters, request bodies (expanded through references), response
 * codes and their schemas, security, and each named schema. Every fingerprint is a flat map from a
 * path such as `$.tags[].name` to a one-line summary of its type and constraint keywords, so a diff
 * points at the exact element that moved.
 *
 * Operation summary and description text is hashed into a separate section: prose can announce a
 * behaviour change (L-30), but it is reported as low-severity drift and never fails a check alone.
 *
 *   node scripts/swagger-digest.mjs [--service x | --spec f | --live] [--write | --check]
 *     (neither)  print the digest to stdout
 *     --write    replace the tracked file with the current digest
 *     --check    compare with the tracked file; exit 1 on structural drift, 2 when it is missing
 *
 * The tracked digest lives at docs/discovery/<service>-digest.json. `--live --check` compares the
 * spec the active environment actually serves with it, which is the only comparison that can show
 * the deployed contract moving away from the tracked one (L-02).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, parseCli, resolveSpecSource } from './lib/cli.mjs';
import { loadModel, objectShape, refName, resolveSchema } from './lib/openapi.mjs';

export const DIGEST_VERSION = 1;
const MAX_DEPTH = 16;

// Keywords that restrict a value, in the order they are printed.
const CONSTRAINTS = [
  'format',
  'const',
  'enum',
  'pattern',
  'x-invalid-pattern',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'default',
  'readOnly',
  'writeOnly',
];
const ALTERNATIVES = ['oneOf', 'anyOf'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Fingerprints

/** One line describing a single schema node: type, constraint keywords and markers. */
function describeNode(schema, { required = false, ref = null } = {}) {
  if (schema === true) return required ? 'any required' : 'any';
  if (schema === false) return 'never';
  const parts = [];
  if (ref) parts.push(`ref=${ref}`);
  if (schema.type !== undefined)
    parts.push([].concat(schema.type).map(String).sort(byName).join('|'));
  if (required) parts.push('required');
  for (const keyword of CONSTRAINTS) {
    if (schema[keyword] !== undefined) parts.push(`${keyword}=${JSON.stringify(schema[keyword])}`);
  }
  if (schema.additionalProperties === false) parts.push('closed');
  for (const keyword of ALTERNATIVES) {
    if (Array.isArray(schema[keyword])) parts.push(`${keyword}=${schema[keyword].length}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'any';
}

/**
 * Flatten a schema into `{ path: line }`. With `expand`, named references are followed (a cycle is
 * cut at the second visit); without it, a reference below the root is recorded by name only, since
 * the named schema has its own entry.
 */
function flatten(model, schema, path, out, options, trail = [], required = false) {
  const name = refName(schema);
  if (name && (!options.expand || trail.includes(name) || trail.length >= MAX_DEPTH)) {
    const marks = [`ref=${name}`, required && 'required', trail.includes(name) && 'cycle'];
    out[path] = marks.filter(Boolean).join(' ');
    return out;
  }
  const resolved = resolveSchema(model, schema);
  out[path] = describeNode(resolved, { required, ref: name });
  if (!isObject(resolved)) return out;
  const nextTrail = name ? [...trail, name] : trail;

  const shape = objectShape(model, resolved);
  for (const property of Object.keys(shape.properties).sort(byName)) {
    flatten(
      model,
      shape.properties[property],
      `${path}.${property}`,
      out,
      options,
      nextTrail,
      shape.required.includes(property),
    );
  }
  if (resolved.items !== undefined)
    flatten(model, resolved.items, `${path}[]`, out, options, nextTrail);
  (resolved.prefixItems ?? []).forEach((item, i) =>
    flatten(model, item, `${path}[${i}]`, out, options, nextTrail),
  );
  if (isObject(resolved.additionalProperties) || resolved.additionalProperties === true)
    flatten(model, resolved.additionalProperties, `${path}{*}`, out, options, nextTrail);
  for (const keyword of ALTERNATIVES) {
    (resolved[keyword] ?? []).forEach((member, i) =>
      flatten(model, member, `${path}<${keyword} ${i}>`, out, options, nextTrail),
    );
  }
  return out;
}

const mediaTypes = (content) =>
  Object.keys(content ?? {})
    .sort(byName)
    .join(', ') || 'none';

function securityLine(security) {
  if (security.length === 0) return 'none';
  return security
    .map((alternative) => [...alternative].sort(byName).join(' + ') || 'anonymous')
    .sort(byName)
    .join(' | ');
}

function parameterEntries(model, parameters) {
  const out = {};
  for (const parameter of parameters) {
    const flat = flatten(
      model,
      parameter.schema,
      '$',
      {},
      { expand: true },
      [],
      parameter.required,
    );
    for (const [path, line] of Object.entries(flat)) {
      out[`${parameter.in}:${parameter.name}${path.slice(1)}`] = line;
    }
  }
  return out;
}

function requestBodyEntries(model, body) {
  if (!body) return {};
  const out = { 'content-type': mediaTypes(body.content) };
  if (body.schema) flatten(model, body.schema, '$', out, { expand: true }, [], body.required);
  else out.$ = body.required ? 'any required' : 'any';
  return out;
}

function responseEntries(model, response) {
  const out = { 'content-type': mediaTypes(response.content) };
  if (response.schema) flatten(model, response.schema, '$', out, { expand: false });
  return out;
}

/** Summary and description, whitespace-normalized and hashed; null when the operation has none. */
export function textHash(operation) {
  const text = [operation.summary, operation.description]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? createHash('sha256').update(text).digest('hex').slice(0, 16) : null;
}

/** Recursively sort object keys, so the serialized digest is stable and diffs stay minimal. */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(byName)
      .map((key) => [key, sortKeys(value[key])]),
  );
}

/** The digest of a normalized model. Pure: the same model always yields the same object. */
export function computeDigest(model) {
  const operations = {};
  const descriptions = {};
  for (const operation of model.operations) {
    operations[operation.key] = {
      security: securityLine(operation.security),
      parameters: parameterEntries(model, operation.parameters),
      requestBody: requestBodyEntries(model, operation.requestBody),
      responses: Object.fromEntries(
        operation.responses.map((response) => [response.status, responseEntries(model, response)]),
      ),
    };
    const hash = textHash(operation);
    if (hash) descriptions[operation.key] = hash;
  }
  const schemas = Object.fromEntries(
    Object.entries(model.schemas).map(([name, schema]) => [
      name,
      flatten(model, schema, '$', {}, { expand: false }),
    ]),
  );
  return sortKeys({ digestVersion: DIGEST_VERSION, operations, schemas, descriptions });
}

export function serializeDigest(digest) {
  return `${JSON.stringify(sortKeys(digest), null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Comparing

/** Report classes in the order they are printed. `descriptions` is the only non-structural one. */
export const DRIFT_CLASSES = [
  'operations',
  'security',
  'parameters',
  'requestBody',
  'responseCodes',
  'responseSchemas',
  'schemas',
  'descriptions',
];

function compareMaps(before = {}, after = {}, report) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort(byName)) {
    if (!(key in after)) report('removed', key, before[key], undefined);
    else if (!(key in before)) report('added', key, undefined, after[key]);
    else if (before[key] !== after[key]) report('changed', key, before[key], after[key]);
  }
}

/**
 * Differences from `tracked` to `current`, as `{ structural, descriptions }`; each entry is
 * `{ class, change, where, before?, after? }` with change `added`, `removed` or `changed`.
 */
export function diffDigests(tracked, current) {
  const structural = [];
  const descriptions = [];
  const push =
    (list, kind, prefix = '') =>
    (change, key, before, after) =>
      list.push({ class: kind, change, where: `${prefix}${key}`, before, after });

  const oldOps = tracked.operations ?? {};
  const newOps = current.operations ?? {};
  compareMaps(
    Object.fromEntries(Object.keys(oldOps).map((key) => [key, 'present'])),
    Object.fromEntries(Object.keys(newOps).map((key) => [key, 'present'])),
    (change, key) => structural.push({ class: 'operations', change, where: key }),
  );

  for (const key of Object.keys(newOps).sort(byName)) {
    const before = oldOps[key];
    const after = newOps[key];
    if (!before) continue;
    if (before.security !== after.security)
      push(structural, 'security')('changed', key, before.security, after.security);
    compareMaps(before.parameters, after.parameters, push(structural, 'parameters', `${key} `));
    compareMaps(before.requestBody, after.requestBody, push(structural, 'requestBody', `${key} `));
    const oldCodes = before.responses ?? {};
    const newCodes = after.responses ?? {};
    for (const status of [...new Set([...Object.keys(oldCodes), ...Object.keys(newCodes)])].sort(
      byName,
    )) {
      if (!(status in newCodes))
        structural.push({ class: 'responseCodes', change: 'removed', where: `${key} ${status}` });
      else if (!(status in oldCodes))
        structural.push({ class: 'responseCodes', change: 'added', where: `${key} ${status}` });
      else
        compareMaps(
          oldCodes[status],
          newCodes[status],
          push(structural, 'responseSchemas', `${key} ${status} `),
        );
    }
    const oldText = tracked.descriptions?.[key] ?? null;
    const newText = current.descriptions?.[key] ?? null;
    if (oldText !== newText) {
      const change = oldText === null ? 'added' : newText === null ? 'removed' : 'changed';
      descriptions.push({
        class: 'descriptions',
        change,
        where: key,
        before: oldText,
        after: newText,
      });
    }
  }

  const oldSchemas = tracked.schemas ?? {};
  const newSchemas = current.schemas ?? {};
  for (const name of [...new Set([...Object.keys(oldSchemas), ...Object.keys(newSchemas)])].sort(
    byName,
  )) {
    if (!(name in newSchemas))
      structural.push({ class: 'schemas', change: 'removed', where: name });
    else if (!(name in oldSchemas))
      structural.push({ class: 'schemas', change: 'added', where: name });
    else compareMaps(oldSchemas[name], newSchemas[name], push(structural, 'schemas', `${name} `));
  }

  return { structural, descriptions };
}

const HEADINGS = {
  operations: 'Operations',
  security: 'Security requirements',
  parameters: 'Parameters',
  requestBody: 'Request bodies',
  responseCodes: 'Response codes',
  responseSchemas: 'Response content',
  schemas: 'Named schemas',
  descriptions: 'Operation text (low severity, does not fail the check)',
};

function formatEntry(entry) {
  const sign = { added: '+', removed: '-', changed: '~' }[entry.change];
  if (entry.change === 'changed')
    return `  ${sign} ${entry.where}: ${entry.before} -> ${entry.after}`;
  const value = entry.change === 'added' ? entry.after : entry.before;
  return `  ${sign} ${entry.where}${value !== undefined && value !== null ? `: ${value}` : ''}`;
}

/** A readable report, grouped by drift class; structural classes first, text drift last. */
export function formatDiff(diff) {
  const entries = [...diff.structural, ...diff.descriptions];
  if (entries.length === 0) return 'No drift.';
  const lines = [];
  for (const kind of DRIFT_CLASSES) {
    const group = entries.filter((entry) => entry.class === kind);
    if (group.length === 0) continue;
    lines.push(`${HEADINGS[kind]} (${group.length}):`, ...group.map(formatEntry));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Command line

export function digestPath(service, root = REPO_ROOT) {
  return join(root, 'docs', 'discovery', `${service}-digest.json`);
}

async function main() {
  const values = parseCli({
    write: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
  });
  if (values.write && values.check) throw new Error('Use only one of --write and --check.');
  const { source, service } = resolveSpecSource(values);
  const model = await loadModel(source);
  for (const problem of model.problems)
    console.error(`swagger-digest: warning: ${problem.where}: ${problem.message}`);
  const digest = computeDigest(model);

  if (!values.write && !values.check) {
    process.stdout.write(serializeDigest(digest));
    return 0;
  }
  if (!service?.name)
    throw new Error('--write and --check need a service pack (--service <name>).');
  const file = digestPath(service.name);
  const shown = relative(REPO_ROOT, file).replace(/\\/g, '/');

  if (values.write) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serializeDigest(digest));
    console.log(
      `swagger-digest: wrote ${shown} (${Object.keys(digest.operations).length} operations) from ${source}`,
    );
    return 0;
  }

  if (!existsSync(file)) {
    console.error(`swagger-digest: no tracked digest at ${shown}; create it with --write.`);
    return 2;
  }
  const diff = diffDigests(JSON.parse(readFileSync(file, 'utf8')), digest);
  const report = formatDiff(diff);
  if (diff.structural.length > 0) {
    console.error(`swagger-digest: ${source} has drifted from ${shown}:\n${report}`);
    console.error('Review the change, then refresh the tracked digest with --write.');
    return 1;
  }
  console.log(`swagger-digest: ${source} matches ${shown} structurally.`);
  if (diff.descriptions.length > 0) console.log(report);
  return 0;
}

// Run only as a command, not when the tests import the exported functions.
const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`swagger-digest: ${error.message}`);
      process.exit(2);
    },
  );
}
