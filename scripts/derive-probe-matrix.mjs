#!/usr/bin/env node
/**
 * Probe matrix: every negative and boundary request an operation's contract calls for, and which
 * of them some spec already sends.
 *
 * A contract states what an API must refuse (a name over its maxLength, a status outside its enum, a
 * weight at an exclusive minimum) and what it must still take (a value exactly at a boundary). Each
 * such statement is a probe. Deriving them from the normalized model (ADR 0003) instead of by hand
 * reaches path and query parameters as well as bodies, and makes the untested ones visible as gaps.
 *
 * Three classes:
 *   scheduled     follows from an explicit constraint: required, enum, length, pattern, bounds,
 *                 item counts, uniqueItems, format, a closed object; also the pairwise combinations
 *                 of enum-like fields (scripts/lib/pairwise.mjs)
 *   exploratory   follows from the declared type only: wrong JSON type, null for a non-nullable
 *                 field, a fraction for an integer, an unknown property on an open object
 *   service-wide  the same battery on every operation, because shared layers handle it: malformed
 *                 and truncated JSON, wrong Content-Type, empty required body, and wrong-type,
 *                 overlong and encoded-slash values for each path parameter
 *
 * Probe ids are `p-` plus the first 10 hex digits of the SHA-256 of
 * `<operation key>|<location>:<field>|<kind>`, so they survive reordering and spec-version changes.
 * A probe is covered when a file under services/<pack>/specs/ contains `probe:<id>`, typically in
 * the test title or a comment next to the request. Constraints that cannot be probed (a pattern that
 * does not compile, oneOf alternatives) are listed as unprobeable instead of failing the run.
 *
 * `send` is a change to an otherwise valid request: `{ in: 'body', pointer, value | omit }` edits the
 * JSON body at a JSON Pointer (array steps use index 0); `{ in, name, value | omit }` sets or drops a
 * query, header or path parameter (`encoded: true` means the value is already percent-encoded);
 * `{ in: 'body', contentType, raw }` replaces the whole body; `{ in: 'combination', set }` applies
 * several of those at once. `expect` is `reject` (4xx) or `accept` (2xx; 404 allowed on paths).
 *
 *   node scripts/derive-probe-matrix.mjs [--service <pack> | --spec <file|url> | --live]
 *        [--write]   write services/<pack>/generated/probe-matrix.json
 *        [--check]   exit 1 when that file is missing or differs from a fresh derivation
 *        [--gaps]    also list every probe no spec covers yet
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseCli, readTextIfExists, resolveSpecSource, REPO_ROOT } from './lib/cli.mjs';
import { loadModel, objectShape, refName, resolveSchema } from './lib/openapi.mjs';
import { allPairs, PAIRWISE_LIMITS } from './lib/pairwise.mjs';

export const PROBE_REFERENCE = /\bprobe:(p-[0-9a-f]{10})\b/g;
export const MATRIX_FILE = join('generated', 'probe-matrix.json');

const JSON_MEDIA = /^application\/(.+\+)?json\b/i;
const MAX_DEPTH = 5;
const OVERLONG_LENGTH = 1024;
const INT32_MAX = 2147483647;
const UNKNOWN_PROPERTY = 'probeUnexpectedField';
const FOREIGN_MEDIA_TYPES = ['text/plain', 'application/xml', 'application/octet-stream'];
const FILLERS = ['a', 'A', '0', 'x', 'Z', '9', 'b', '-', '_'];
const PATTERN_BREAKERS = ['!', ' ', '~', '#', '0', 'a', 'A', '-', '_', '.'];

// A deterministic value each common format rejects.
const BROKEN_FORMATS = {
  'date-time': '2024-13-40T25:61:00Z',
  date: '2024-13-40',
  time: '25:61:61',
  email: 'no-at-sign.example.test',
  uuid: 'not-a-uuid',
  uri: 'not a uri',
  ipv4: '999.999.999.999',
  ipv6: 'not:an:ipv6:::address',
  hostname: '-bad-.host-',
};
const SAMPLE_FORMATS = {
  'date-time': '2024-01-01T00:00:00Z',
  date: '2024-01-01',
  time: '12:00:00Z',
  email: 'probe@example.test',
  uuid: '00000000-0000-4000-8000-000000000000',
  uri: 'https://example.test/probe',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  hostname: 'example.test',
};

const REJECT = Object.freeze({ outcome: 'reject', status: '4xx' });
const ACCEPT = Object.freeze({ outcome: 'accept', status: '2xx' });
// An accepted path value may still name a resource that does not exist.
const ACCEPT_PATH = Object.freeze({ outcome: 'accept', status: '2xx or 404' });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Drops binary noise such as 49.989999999 from decimal steps; whole numbers stay exact.
const tidy = (n) => (Number.isInteger(n) ? n : Number(n.toPrecision(12)));
const without = (object, keys) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

export function probeId(operation, location, field, kind) {
  const digest = createHash('sha256').update(`${operation}|${location}:${field}|${kind}`);
  return `p-${digest.digest('hex').slice(0, 10)}`;
}

// ---------------------------------------------------------------------------------------------
// Reading a schema

/** One flat view of a schema: references followed, `allOf` members merged, nullability split off. */
function view(model, schema) {
  let current = resolveSchema(model, schema);
  if (!isObject(current)) return { schema: {}, nullable: current === true, alternatives: false };
  let nullable = false;
  const choice = current.anyOf ?? current.oneOf;
  if (Array.isArray(choice)) {
    const real = choice.filter((member) => !(isObject(member) && member.type === 'null'));
    if (real.length === 1 && real.length < choice.length) {
      nullable = true;
      current = { ...without(current, ['anyOf', 'oneOf']), ...resolveSchema(model, real[0]) };
    } else {
      return { schema: current, nullable, alternatives: true };
    }
  }
  if (Array.isArray(current.allOf)) {
    // Scalar keywords of the members apply too; properties stay for objectShape, which merges them.
    const merged = {};
    for (const member of current.allOf) {
      Object.assign(merged, without(view(model, member).schema, ['properties', 'required']));
    }
    current = { ...merged, ...current };
  }
  const types = [current.type ?? []].flat();
  if (types.includes('null') || (Array.isArray(current.enum) && current.enum.includes(null))) {
    nullable = true;
  }
  return { schema: current, nullable, alternatives: false };
}

function typeOf(schema) {
  const declared = [schema.type ?? []].flat().filter((type) => type !== 'null');
  if (declared.length > 0) return declared[0];
  if (schema.properties || schema.allOf) return 'object';
  if (schema.items) return 'array';
  if (Array.isArray(schema.enum)) {
    const first = schema.enum.find((value) => value !== null);
    if (typeof first === 'number') return Number.isInteger(first) ? 'integer' : 'number';
    return typeof first;
  }
  if ('minLength' in schema || 'maxLength' in schema || 'pattern' in schema) return 'string';
  if ('minimum' in schema || 'maximum' in schema) return 'number';
  return null;
}

function compiled(schema) {
  return typeof schema.pattern === 'string' ? new RegExp(schema.pattern, 'u') : null;
}

/** A string of exactly `length` characters that satisfies the pattern, or null. */
function textOfLength(schema, length) {
  const pattern = compiled(schema);
  for (const filler of FILLERS) {
    const text = filler.repeat(length);
    if (!pattern || pattern.test(text)) return text;
  }
  return null;
}

/** A value the schema accepts, for array items and baseline bodies; undefined when none is found. */
export function sampleValue(model, schema, depth = 0, seen = new Set()) {
  const name = refName(schema);
  if (name && seen.has(name)) return undefined;
  const nextSeen = name ? new Set([...seen, name]) : seen;
  const { schema: s, alternatives } = view(model, schema);
  if (alternatives) {
    const first = (s.oneOf ?? s.anyOf)[0];
    return first === undefined ? undefined : sampleValue(model, first, depth, nextSeen);
  }
  if ('const' in s) return s.const;
  if (Array.isArray(s.examples) && s.examples.length > 0) return s.examples[0];
  if ('default' in s) return s.default;
  if (Array.isArray(s.enum)) return s.enum.find((value) => value !== null) ?? null;
  if (depth > MAX_DEPTH) return undefined;
  switch (typeOf(s)) {
    case 'object': {
      const shape = objectShape(model, s);
      const out = {};
      for (const key of shape.required) {
        const value = sampleValue(model, shape.properties[key] ?? {}, depth + 1, nextSeen);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    case 'array': {
      const count = Math.min(Math.max(s.minItems ?? 0, 1), s.maxItems ?? Infinity);
      const item = sampleValue(model, s.items ?? {}, depth + 1, nextSeen);
      return item === undefined ? undefined : Array.from({ length: count }, () => item);
    }
    case 'string':
      return (
        SAMPLE_FORMATS[s.format] ??
        textOfLength(s, Math.min(Math.max(s.minLength ?? 0, 1), s.maxLength ?? Infinity)) ??
        undefined
      );
    case 'integer':
    case 'number': {
      const step = s.multipleOf ?? (typeOf(s) === 'integer' ? 1 : 0.01);
      let value = s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + step : 1);
      if (s.maximum !== undefined && value > s.maximum) value = s.maximum;
      return tidy(value);
    }
    case 'boolean':
      return true;
    default:
      return 'probe';
  }
}

// ---------------------------------------------------------------------------------------------
// Building probes

class Collector {
  constructor(operation) {
    this.operation = operation;
    this.probes = new Map();
    this.unprobeable = new Map();
  }

  add({ location, field, kind, cls, technique, basis, send, expect, note }) {
    const id = probeId(this.operation, location, field, kind);
    if (this.probes.has(id)) return;
    const probe = { id, operation: this.operation, class: cls, location, field, kind, technique };
    probe.basis = basis;
    probe.send = send;
    probe.expect = expect;
    if (note) probe.note = note;
    this.probes.set(id, probe);
  }

  skip({ location, field, kind, reason }) {
    const key = `${location}:${field}|${kind}`;
    if (!this.unprobeable.has(key)) {
      this.unprobeable.set(key, { operation: this.operation, location, field, kind, reason });
    }
  }
}

// Where a field lives and how a value reaches it.
function bodyTarget(field, pointer) {
  return {
    location: 'body',
    field,
    place: (value) => ({ in: 'body', pointer, value }),
    omit: () => ({ in: 'body', pointer, omit: true }),
    child: (name) => bodyTarget(field === '$' ? name : `${field}.${name}`, `${pointer}/${name}`),
    items: () => bodyTarget(field === '$' ? '[]' : `${field}[]`, `${pointer}/0`),
  };
}

function parameterTarget(parameter, wrap = (value) => value, field = parameter.name) {
  return {
    location: parameter.in,
    field,
    parameter: true,
    place: (value) => ({ in: parameter.in, name: parameter.name, value: wrap(value) }),
    omit: () => ({ in: parameter.in, name: parameter.name, omit: true }),
    items: () => parameterTarget(parameter, (value) => [value], `${field}[]`),
  };
}

function outsideEnum(values) {
  const real = values.filter((value) => value !== null);
  if (real.length > 0 && real.every((value) => typeof value === 'number')) {
    return Math.max(...real) + 1;
  }
  if (real.length > 0 && real.every((value) => typeof value === 'boolean')) {
    return real.includes(true) ? (real.includes(false) ? 'neither' : false) : true;
  }
  let candidate = 'unlisted-value';
  while (real.includes(candidate)) candidate += '-x';
  return candidate;
}

function wrongTypeValue(type, onTheWire) {
  if (onTheWire) {
    if (type === 'integer' || type === 'number') return 'not-a-number';
    if (type === 'boolean') return 'not-a-boolean';
    return undefined; // every query or header value is text, so a string cannot be mistyped
  }
  return {
    string: 12345,
    integer: 'not-a-number',
    number: 'not-a-number',
    boolean: 'not-a-boolean',
    object: 'not-an-object',
    array: 'not-an-array',
  }[type];
}

function stringProbes(c, s, target, accept) {
  const add = (fields) => c.add({ location: target.location, field: target.field, ...fields });
  const extra = [s.pattern && 'pattern', s.format in BROKEN_FORMATS && 'format'].filter(Boolean);
  const lengthProbe = (kind, length, expect, basis) => {
    const fitting = textOfLength(s, length);
    if (expect === REJECT) {
      const value = fitting ?? 'a'.repeat(length);
      const clash = fitting ? extra.filter((what) => what === 'format') : extra;
      const note = clash.length ? `the value may also break the ${clash.join(' and ')}` : undefined;
      add({
        kind,
        cls: 'scheduled',
        technique: 'boundary-value',
        basis,
        expect,
        note,
        send: target.place(value),
      });
    } else if (fitting && !(s.format in BROKEN_FORMATS)) {
      add({
        kind,
        cls: 'scheduled',
        technique: 'boundary-value',
        basis,
        expect,
        send: target.place(fitting),
      });
    } else {
      c.skip({
        location: target.location,
        field: target.field,
        kind,
        reason: `no value of length ${length} satisfies the other constraints`,
      });
    }
  };
  if (typeof s.minLength === 'number' && s.minLength > 0) {
    lengthProbe('below-min-length', s.minLength - 1, REJECT, `minLength ${s.minLength}`);
    lengthProbe('at-min-length', s.minLength, accept, `minLength ${s.minLength}`);
  }
  if (typeof s.maxLength === 'number') {
    lengthProbe('at-max-length', s.maxLength, accept, `maxLength ${s.maxLength}`);
    lengthProbe('above-max-length', s.maxLength + 1, REJECT, `maxLength ${s.maxLength}`);
  }
  if (typeof s['x-invalid-pattern'] === 'string') {
    c.skip({
      location: target.location,
      field: target.field,
      kind: 'pattern-mismatch',
      reason: `pattern ${s['x-invalid-pattern']} does not compile`,
    });
  } else if (typeof s.pattern === 'string') {
    const pattern = compiled(s);
    const length = Math.min(Math.max(s.minLength ?? 1, 1), s.maxLength ?? Infinity);
    const value = PATTERN_BREAKERS.map((ch) => ch.repeat(length)).find(
      (text) => !pattern.test(text),
    );
    if (value === undefined) {
      c.skip({
        location: target.location,
        field: target.field,
        kind: 'pattern-mismatch',
        reason: `no candidate value breaks pattern ${s.pattern}`,
      });
    } else {
      add({
        kind: 'pattern-mismatch',
        cls: 'scheduled',
        technique: 'equivalence-partition',
        basis: `pattern ${s.pattern}`,
        expect: REJECT,
        send: target.place(value),
      });
    }
  }
  if (s.format in BROKEN_FORMATS) {
    add({
      kind: 'format-violation',
      cls: 'scheduled',
      technique: 'equivalence-partition',
      basis: `format ${s.format}`,
      expect: REJECT,
      send: target.place(BROKEN_FORMATS[s.format]),
    });
  }
}

function numberProbes(c, s, type, target, accept) {
  const add = (kind, value, expect, basis) =>
    c.add({
      location: target.location,
      field: target.field,
      kind,
      cls: 'scheduled',
      technique: 'boundary-value',
      basis,
      expect,
      send: target.place(tidy(value)),
    });
  const step = s.multipleOf ?? (type === 'integer' ? 1 : 0.01);
  if (typeof s.exclusiveMinimum === 'number') {
    const basis = `exclusiveMinimum ${s.exclusiveMinimum}`;
    add('at-exclusive-minimum', s.exclusiveMinimum, REJECT, basis);
    add('above-exclusive-minimum', s.exclusiveMinimum + step, accept, basis);
  } else if (typeof s.minimum === 'number') {
    add('below-minimum', s.minimum - step, REJECT, `minimum ${s.minimum}`);
    add('at-minimum', s.minimum, accept, `minimum ${s.minimum}`);
  }
  if (typeof s.exclusiveMaximum === 'number') {
    const basis = `exclusiveMaximum ${s.exclusiveMaximum}`;
    add('below-exclusive-maximum', s.exclusiveMaximum - step, accept, basis);
    add('at-exclusive-maximum', s.exclusiveMaximum, REJECT, basis);
  } else if (typeof s.maximum === 'number') {
    add('at-maximum', s.maximum, accept, `maximum ${s.maximum}`);
    add('above-maximum', s.maximum + step, REJECT, `maximum ${s.maximum}`);
  }
  const ceiling = s.exclusiveMaximum ?? s.maximum;
  if (s.format === 'int32' && (ceiling === undefined || ceiling > INT32_MAX)) {
    add('int32-overflow', INT32_MAX + 1, REJECT, 'format int32');
  }
  if (s.format === 'int64' && ceiling === undefined) {
    // 2^63 is the first value past the signed 64-bit range and is exact as a double.
    add('int64-overflow', 2 ** 63, REJECT, 'format int64');
  }
}

function arrayProbes(c, model, s, target, accept, ctx) {
  const item = sampleValue(model, s.items ?? {});
  const add = (kind, count, expect, basis, technique = 'boundary-value') => {
    if (item === undefined) {
      c.skip({
        location: target.location,
        field: target.field,
        kind,
        reason: 'no valid item could be built',
      });
      return;
    }
    const value = Array.from({ length: count }, () => item);
    c.add({
      location: target.location,
      field: target.field,
      kind,
      cls: 'scheduled',
      technique,
      basis,
      expect,
      send: target.place(value),
    });
  };
  if (typeof s.minItems === 'number' && s.minItems > 0) {
    add('below-min-items', s.minItems - 1, REJECT, `minItems ${s.minItems}`);
    add('at-min-items', s.minItems, accept, `minItems ${s.minItems}`);
  }
  if (typeof s.maxItems === 'number') {
    add('at-max-items', s.maxItems, accept, `maxItems ${s.maxItems}`);
    add('above-max-items', s.maxItems + 1, REJECT, `maxItems ${s.maxItems}`);
  }
  if (s.uniqueItems === true && (s.maxItems ?? 2) >= 2) {
    add('duplicate-items', 2, REJECT, 'uniqueItems', 'equivalence-partition');
  }
  if (s.items !== undefined)
    fieldProbes(c, model, s.items, target.items(), { ...ctx, required: false });
}

function objectProbes(c, model, s, target, ctx) {
  const shape = objectShape(model, s);
  const closed = s.additionalProperties === false || s.unevaluatedProperties === false;
  if (target.location === 'body') {
    c.add({
      location: target.location,
      field: target.field,
      kind: 'unknown-property',
      cls: closed ? 'scheduled' : 'exploratory',
      technique: closed ? 'equivalence-partition' : 'error-guessing',
      basis: closed ? 'additionalProperties false' : 'open object: an extra property is allowed',
      expect: closed ? REJECT : ACCEPT,
      send: target.child(UNKNOWN_PROPERTY).place('probe'),
    });
  }
  if (!target.child) return; // an object in a query string has no agreed serialization to probe
  for (const name of Object.keys(shape.properties)) {
    fieldProbes(c, model, shape.properties[name], target.child(name), {
      ...ctx,
      required: shape.required.includes(name),
    });
  }
}

/** Every probe for one field (and the fields under it). */
function fieldProbes(c, model, schema, target, ctx) {
  const name = refName(schema);
  if (name && ctx.seen.has(name)) return; // a recursive model: one level of it is enough
  const seen = name ? new Set([...ctx.seen, name]) : ctx.seen;
  const { schema: s, nullable, alternatives } = view(model, schema);
  if (s.readOnly === true) return;
  const accept = target.location === 'path' ? ACCEPT_PATH : ACCEPT;
  const add = (fields) => c.add({ location: target.location, field: target.field, ...fields });

  if (ctx.required && target.location === 'body') {
    add({
      kind: 'missing-required',
      cls: 'scheduled',
      technique: 'equivalence-partition',
      basis: 'required',
      expect: REJECT,
      send: target.omit(),
    });
  }
  if (alternatives) {
    c.skip({
      location: target.location,
      field: target.field,
      kind: 'alternatives',
      reason: 'oneOf/anyOf alternatives are not probed; which one applies is decided at run time',
    });
    return;
  }
  if (ctx.depth > MAX_DEPTH) return;

  const type = typeOf(s);
  if (ctx.exploratory && type) {
    const wrong = wrongTypeValue(type, Boolean(target.parameter));
    if (wrong !== undefined) {
      add({
        kind: 'wrong-type',
        cls: 'exploratory',
        technique: 'error-guessing',
        basis: `type ${type}`,
        expect: REJECT,
        send: target.place(wrong),
      });
    }
    if (!nullable && !target.parameter) {
      add({
        kind: 'null-value',
        cls: 'exploratory',
        technique: 'error-guessing',
        basis: `type ${type}, not nullable`,
        expect: REJECT,
        send: target.place(null),
      });
    }
    if (type === 'integer') {
      add({
        kind: 'integer-fraction',
        cls: 'exploratory',
        technique: 'error-guessing',
        basis: 'type integer',
        expect: REJECT,
        send: target.place(target.parameter ? '1.5' : 1.5),
      });
    }
  }
  if (Array.isArray(s.enum)) {
    add({
      kind: 'enum-outside',
      cls: 'scheduled',
      technique: 'equivalence-partition',
      basis: `enum ${s.enum.length} values`,
      expect: REJECT,
      send: target.place(outsideEnum(s.enum)),
    });
  }
  if ('const' in s) {
    add({
      kind: 'const-mismatch',
      cls: 'scheduled',
      technique: 'equivalence-partition',
      basis: 'const',
      expect: REJECT,
      send: target.place(outsideEnum([s.const])),
    });
  }
  const next = { ...ctx, seen, depth: ctx.depth + 1 };
  if (type === 'string') stringProbes(c, s, target, accept);
  else if (type === 'integer' || type === 'number') numberProbes(c, s, type, target, accept);
  else if (type === 'array') arrayProbes(c, model, s, target, accept, next);
  else if (type === 'object') objectProbes(c, model, s, target, next);
}

// Enum-like fields (enum values, booleans) whose combinations the matrix covers pairwise.
function factorsOf(model, operation, c) {
  const factors = [];
  const levelsFor = (schema, optional) => {
    const { schema: s } = view(model, schema);
    if (s.readOnly === true) return null;
    let values;
    if (Array.isArray(s.enum)) values = s.enum.filter((value) => value !== null);
    else if (typeOf(s) === 'boolean') values = [true, false];
    else return null;
    const levels = values.map((value) => ({ value }));
    if (optional) levels.push({ omit: true });
    return levels.slice(0, PAIRWISE_LIMITS.levels);
  };
  const combinable = operation.parameters.filter((p) => ['query', 'header'].includes(p.in));
  for (const param of combinable) {
    const levels = levelsFor(param.schema, !param.required);
    if (levels)
      factors.push({ name: `${param.in}:${param.name}`, values: levels, parameter: param });
  }
  if (operation.requestBody?.schema) {
    const shape = objectShape(model, operation.requestBody.schema);
    for (const name of Object.keys(shape.properties)) {
      const levels = levelsFor(shape.properties[name], !shape.required.includes(name));
      if (levels) factors.push({ name: `body:${name}`, values: levels, pointer: `/${name}` });
    }
  }
  for (const dropped of factors.slice(PAIRWISE_LIMITS.factors)) {
    const [location, field] = dropped.name.split(':');
    c.skip({
      location,
      field,
      kind: 'pairwise-combination',
      reason: `more than ${PAIRWISE_LIMITS.factors} combinable fields; left out of the pairwise set`,
    });
  }
  return factors.slice(0, PAIRWISE_LIMITS.factors);
}

function combinationProbes(model, operation, c) {
  const factors = factorsOf(model, operation, c);
  if (factors.length < 2) return;
  const rows = allPairs(factors.map(({ name, values }) => ({ name, values })));
  for (const row of rows) {
    const set = factors.map((factor) => {
      const level = row[factor.name];
      const where = factor.parameter
        ? { in: factor.parameter.in, name: factor.parameter.name }
        : { in: 'body', pointer: factor.pointer };
      return level.omit ? { ...where, omit: true } : { ...where, value: level.value };
    });
    const label = factors
      .map((factor) => {
        const level = row[factor.name];
        return `${factor.name}=${level.omit ? '(omitted)' : JSON.stringify(level.value)}`;
      })
      .join(';');
    c.add({
      location: 'combination',
      field: label,
      kind: 'pairwise-combination',
      cls: 'scheduled',
      technique: 'pairwise',
      basis: `${rows.length} of ${factors.reduce((n, f) => n * f.values.length, 1)} combinations`,
      expect: ACCEPT,
      send: { in: 'combination', set },
    });
  }
}

function serviceWideProbes(model, operation, c) {
  const add = (location, field, kind, basis, send) =>
    c.add({
      location,
      field,
      kind,
      cls: 'service-wide',
      technique: 'error-guessing',
      basis,
      expect: REJECT,
      send,
    });
  const body = operation.requestBody;
  if (body) {
    const types = Object.keys(body.content);
    const jsonType = types.find((type) => JSON_MEDIA.test(type));
    const baseline = sampleValue(model, body.schema ?? {});
    const text = JSON.stringify(baseline === undefined ? {} : baseline);
    if (jsonType) {
      add('body', '(raw)', 'malformed-json', 'shared JSON parsing', {
        in: 'body',
        contentType: jsonType,
        raw: '{"probe" true}',
      });
      add('body', '(raw)', 'truncated-json', 'shared JSON parsing', {
        in: 'body',
        contentType: jsonType,
        raw: text.slice(0, Math.max(1, Math.floor(text.length / 2))),
      });
    }
    const foreign = FOREIGN_MEDIA_TYPES.find(
      (type) => !types.some((declared) => declared === type || declared === '*/*'),
    );
    if (foreign) {
      add('body', '(raw)', 'wrong-content-type', `declared: ${types.join(', ')}`, {
        in: 'body',
        contentType: foreign,
        raw: text,
      });
    }
    if (body.required) {
      add('body', '(raw)', 'empty-body', 'requestBody required', {
        in: 'body',
        contentType: types[0] ?? 'application/json',
        raw: '',
      });
    }
  }
  for (const parameter of operation.parameters.filter((p) => p.in === 'path')) {
    const { schema: s } = view(model, parameter.schema);
    const type = typeOf(s);
    const place = (value, extra = {}) => ({ in: 'path', name: parameter.name, value, ...extra });
    const wrong = wrongTypeValue(type, true);
    if (wrong !== undefined) {
      add('path', parameter.name, 'wrong-type', `type ${type}`, place(wrong));
    }
    const long =
      type === 'integer' || type === 'number'
        ? '9'.repeat(64)
        : 'a'.repeat(Math.max(OVERLONG_LENGTH, (s.maxLength ?? 0) + 1));
    add('path', parameter.name, 'overlong', 'shared routing and validation', place(long));
    add(
      'path',
      parameter.name,
      'encoded-slash',
      'shared routing',
      place('probe%2Fslash', { encoded: true }),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// The matrix

/** Probe ids referenced from the files under `dir`, mapped to the files (relative to `root`). */
export function findProbeReferences(dir, root = REPO_ROOT) {
  const found = new Map();
  if (!existsSync(dir)) return found;
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => join(dirent.parentPath, dirent.name));
  for (const absolute of files) {
    const shown = relative(root, absolute).split('\\').join('/');
    for (const [, id] of readFileSync(absolute, 'utf8').matchAll(PROBE_REFERENCE)) {
      const citing = found.get(id) ?? new Set();
      found.set(id, citing.add(shown));
    }
  }
  for (const [id, citing] of found) found.set(id, [...citing].sort());
  return found;
}

const CLASSES = ['scheduled', 'exploratory', 'service-wide'];

function tally(probes) {
  return Object.fromEntries(
    CLASSES.map((cls) => {
      const own = probes.filter((probe) => probe.class === cls);
      return [cls, { covered: own.filter((probe) => probe.covered).length, total: own.length }];
    }),
  );
}

/**
 * The probe matrix of a model. `references` maps probe ids to the spec files that cite them.
 * @param {import('./lib/openapi.d.mts').Model} model
 */
export function deriveProbeMatrix(model, { service = null, references = new Map() } = {}) {
  const probes = [];
  const unprobeable = [];
  for (const operation of model.operations) {
    const c = new Collector(operation['key']);
    const ctx = { seen: new Set(), depth: 0, exploratory: true, required: false };
    for (const parameter of operation.parameters.filter((p) => p.in !== 'cookie')) {
      const target = parameterTarget(parameter);
      if (parameter.required && parameter.in !== 'path') {
        c.add({
          location: parameter.in,
          field: parameter.name,
          kind: 'missing-required',
          cls: 'scheduled',
          technique: 'equivalence-partition',
          basis: 'required',
          expect: REJECT,
          send: target.omit(),
        });
      }
      // Path values are mistyped by the service-wide battery; the rest is per constraint.
      fieldProbes(c, model, parameter.schema, target, {
        ...ctx,
        exploratory: parameter.in !== 'path',
      });
    }
    if (operation.requestBody?.schema) {
      fieldProbes(c, model, operation.requestBody.schema, bodyTarget('$', ''), ctx);
    }
    combinationProbes(model, operation, c);
    serviceWideProbes(model, operation, c);
    for (const probe of c.probes.values()) {
      const files = references.get(probe.id);
      probe.covered = Boolean(files);
      if (files) probe.coveredBy = files;
      probes.push(probe);
    }
    unprobeable.push(...c.unprobeable.values());
  }

  const byKind = {};
  for (const probe of probes) byKind[probe.kind] = (byKind[probe.kind] ?? 0) + 1;
  return {
    $comment:
      'Generated by scripts/derive-probe-matrix.mjs; do not edit. A spec covers a probe by containing probe:<id>.',
    service,
    api: { title: model.info.title, version: model.info.version },
    totals: { ...tally(probes), unprobeable: unprobeable.length },
    byKind: Object.fromEntries(Object.entries(byKind).sort(([p], [q]) => p.localeCompare(q))),
    operations: model.operations.map((operation) => ({
      operation: operation['key'],
      ...tally(probes.filter((probe) => probe.operation === operation['key'])),
      unprobeable: unprobeable.filter((entry) => entry.operation === operation['key']).length,
    })),
    probes,
    unprobeable,
  };
}

// ---------------------------------------------------------------------------------------------
// Output

const WIDTH = 100;
const flat = (value) => !isObject(value) && !Array.isArray(value);

// JSON laid out the way the repository formatter lays it out, so a regenerated file passes the
// format check unchanged: objects always open, arrays of plain values on one line when they fit.
export function formatJson(value) {
  const render = (node, indent, lead, tail) => {
    const pad = ' '.repeat(indent);
    const inner = ' '.repeat(indent + 2);
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      if (node.every(flat)) {
        const line = `[${node.map((item) => JSON.stringify(item)).join(', ')}]`;
        if (indent + lead + line.length + tail <= WIDTH) return line;
        if (node.every((item) => typeof item === 'number')) {
          const rows = [];
          let row = '';
          for (const item of node.map(String)) {
            const next = row ? `${row}, ${item}` : item;
            if (row && inner.length + next.length + 1 > WIDTH) {
              rows.push(`${row},`);
              row = item;
            } else row = next;
          }
          rows.push(row);
          return `[\n${rows.map((r) => inner + r).join('\n')}\n${pad}]`;
        }
      }
      const items = node.map(
        (item, i) => inner + render(item, indent + 2, 0, i < node.length - 1 ? 1 : 0),
      );
      return `[\n${items.join(',\n')}\n${pad}]`;
    }
    if (isObject(node)) {
      const entries = Object.entries(node).filter(([, item]) => item !== undefined);
      if (entries.length === 0) return '{}';
      const lines = entries.map(([key, item], i) => {
        const label = `${JSON.stringify(key)}: `;
        const rendered = render(item, indent + 2, label.length, i < entries.length - 1 ? 1 : 0);
        return inner + label + rendered;
      });
      return `{\n${lines.join(',\n')}\n${pad}}`;
    }
    return JSON.stringify(node);
  };
  return `${render(value, 0, 0, 0)}\n`;
}

function summaryTable(matrix) {
  const cell = ({ covered, total }) => `${covered}/${total}`;
  const rows = matrix.operations.map((entry) => [
    entry.operation,
    cell(entry.scheduled),
    cell(entry.exploratory),
    cell(entry['service-wide']),
    String(entry.unprobeable),
  ]);
  rows.push([
    'Total',
    cell(matrix.totals.scheduled),
    cell(matrix.totals.exploratory),
    cell(matrix.totals['service-wide']),
    String(matrix.totals.unprobeable),
  ]);
  const head = ['Operation', 'Scheduled', 'Exploratory', 'Service-wide', 'Unprobeable'];
  const widths = head.map((title, i) =>
    Math.max(title.length, ...rows.map((row) => row[i].length)),
  );
  const line = (row) =>
    row.map((text, i) => (i === 0 ? text.padEnd(widths[i]) : text.padStart(widths[i]))).join('  ');
  return [line(head), ...rows.map(line)].join('\n');
}

async function main() {
  const values = parseCli({
    write: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    gaps: { type: 'boolean', default: false },
  });
  const { source, service } = resolveSpecSource(values);
  if ((values.write || values.check) && !service) {
    throw new Error('--write and --check need a service pack (--service <name>).');
  }
  const references = service ? findProbeReferences(join(service.dir, 'specs')) : new Map();
  const model = await loadModel(source);
  const matrix = deriveProbeMatrix(model, { service: service?.name ?? null, references });

  console.log(summaryTable(matrix));
  console.log(
    `\nCoverage: a spec under services/${service?.name ?? '<pack>'}/specs/ covers a probe by containing probe:<id>.`,
  );
  for (const entry of matrix.unprobeable) {
    console.log(
      `unprobeable  ${entry.operation}  ${entry.location}:${entry.field}  ${entry.kind}: ${entry.reason}`,
    );
  }
  if (values.gaps) {
    for (const probe of matrix.probes.filter((p) => !p.covered)) {
      console.log(
        `gap  ${probe.id}  ${probe.class}  ${probe.operation}  ${probe.location}:${probe.field}  ${probe.kind}`,
      );
    }
  }

  const text = formatJson(matrix);
  if (service) {
    const file = join(service.dir, MATRIX_FILE);
    const shown = relative(REPO_ROOT, file).split('\\').join('/');
    if (values.write) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      console.log(`\nWrote ${shown}`);
    }
    if (values.check) {
      const current = readTextIfExists(file);
      if (current !== text) {
        console.error(`\n${shown} is out of date; run with --write.`);
        process.exitCode = 1;
      }
    }
  }
}

// Run only as a command; the tests import the functions above.
const invokedAsCommand = resolve(process.argv[1] ?? '.') === import.meta.filename;
if (invokedAsCommand) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
