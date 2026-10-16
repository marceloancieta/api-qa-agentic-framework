// Probe matrix (CON-04), its pairwise combinations (CON-05) and the service-wide battery (CON-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadModel } from '../lib/openapi.mjs';
import { missingPairs } from '../lib/pairwise.mjs';
import {
  deriveProbeMatrix,
  findProbeReferences,
  formatJson,
  probeId,
} from '../derive-probe-matrix.mjs';

const FIXTURES = join(import.meta.dirname, '..', '__fixtures__');
const shelter = (name) => loadModel(join(FIXTURES, 'openapi', name));
const catalog = () => loadModel(join(FIXTURES, 'derive-probe-matrix', 'catalog-3.1.json'));

const find = (matrix, operation, where, kind) =>
  matrix.probes.find(
    (p) => p.operation === operation && `${p.location}:${p.field}` === where && p.kind === kind,
  );

test('the shelter resource in Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 yields the same matrix', async () => {
  const [v2, v30, v31] = await Promise.all(
    ['shelter-2.0.json', 'shelter-3.0.json', 'shelter-3.1.yaml'].map(shelter),
  );
  const matrix = deriveProbeMatrix(v2);
  assert.ok(matrix.probes.length > 20);
  assert.deepEqual(deriveProbeMatrix(v30), matrix);
  assert.deepEqual(deriveProbeMatrix(v31), matrix);
});

test('the Animal constraints give their scheduled probes', async () => {
  const matrix = deriveProbeMatrix(await shelter('shelter-3.0.json'));
  const create = 'POST /animals';
  const expected = [
    ['body:name', 'missing-required', 'reject', { in: 'body', pointer: '/name', omit: true }],
    ['body:name', 'below-min-length', 'reject', { in: 'body', pointer: '/name', value: '' }],
    ['body:name', 'at-min-length', 'accept', { in: 'body', pointer: '/name', value: 'a' }],
    [
      'body:name',
      'at-max-length',
      'accept',
      { in: 'body', pointer: '/name', value: 'a'.repeat(50) },
    ],
    [
      'body:name',
      'above-max-length',
      'reject',
      { in: 'body', pointer: '/name', value: 'a'.repeat(51) },
    ],
    ['body:name', 'pattern-mismatch', 'reject', { in: 'body', pointer: '/name', value: '!' }],
    ['body:weight', 'at-exclusive-minimum', 'reject', { in: 'body', pointer: '/weight', value: 0 }],
    [
      'body:weight',
      'above-exclusive-minimum',
      'accept',
      { in: 'body', pointer: '/weight', value: 0.01 },
    ],
    [
      'body:status',
      'enum-outside',
      'reject',
      { in: 'body', pointer: '/status', value: 'unlisted-value' },
    ],
  ];
  for (const [where, kind, outcome, send] of expected) {
    const probe = find(matrix, create, where, kind);
    assert.ok(probe, `${where} ${kind}`);
    assert.equal(probe.class, 'scheduled');
    assert.equal(probe.expect.outcome, outcome, `${where} ${kind}`);
    assert.deepEqual(probe.send, send, `${where} ${kind}`);
    assert.equal(probe.id, probeId(create, ...where.split(':'), kind));
  }
  assert.equal(find(matrix, create, 'body:id', 'wrong-type'), undefined, 'readOnly id is skipped');
  assert.equal(find(matrix, create, 'body:nickname', 'null-value'), undefined, 'nullable');
  assert.equal(find(matrix, create, 'body:name', 'wrong-type').class, 'exploratory');
  assert.equal(find(matrix, create, 'body:$', 'unknown-property').class, 'exploratory');

  const read = 'GET /animals/{animalId}';
  assert.equal(find(matrix, read, 'path:animalId', 'below-minimum').send.value, 0);
  assert.equal(find(matrix, read, 'path:animalId', 'int64-overflow').send.value, 2 ** 63);
  assert.deepEqual(find(matrix, read, 'path:animalId', 'at-minimum').expect, {
    outcome: 'accept',
    status: '2xx or 404',
  });
  assert.equal(find(matrix, read, 'query:verbose', 'wrong-type').send.value, 'not-a-boolean');
});

test('the service-wide battery reaches every body and every path parameter', async () => {
  const matrix = deriveProbeMatrix(await shelter('shelter-3.0.json'));
  const kinds = (operation) =>
    matrix.probes
      .filter((p) => p.operation === operation && p.class === 'service-wide')
      .map((p) => `${p.location}:${p.field}|${p.kind}`);
  assert.deepEqual(kinds('POST /animals'), [
    'body:(raw)|malformed-json',
    'body:(raw)|truncated-json',
    'body:(raw)|wrong-content-type',
    'body:(raw)|empty-body',
  ]);
  assert.deepEqual(kinds('GET /animals/{animalId}'), [
    'path:animalId|wrong-type',
    'path:animalId|overlong',
    'path:animalId|encoded-slash',
  ]);
  const truncated = find(matrix, 'POST /animals', 'body:(raw)', 'truncated-json').send.raw;
  assert.throws(() => JSON.parse(truncated), SyntaxError);
  assert.equal(
    find(matrix, 'POST /animals', 'body:(raw)', 'wrong-content-type').send.contentType,
    'text/plain',
  );
});

test('constraints that cannot be probed are reported, not fatal', async () => {
  const matrix = deriveProbeMatrix(await catalog());
  const skipped = matrix.unprobeable.map((u) => `${u.location}:${u.field}|${u.kind}`);
  assert.deepEqual(skipped, [
    'body:code|pattern-mismatch',
    'body:title|pattern-mismatch',
    'body:variant|alternatives',
  ]);
  assert.match(matrix.unprobeable[0].reason, /does not compile/);
  assert.equal(matrix.totals.unprobeable, 3);
  assert.ok(find(matrix, 'POST /items', 'body:code', 'missing-required'), 'the rest still derives');
});

test('formats, item counts, closed objects and int32 give scheduled probes', async () => {
  const matrix = deriveProbeMatrix(await catalog());
  const create = 'POST /items';
  assert.equal(find(matrix, create, 'body:contact', 'format-violation').class, 'scheduled');
  assert.equal(find(matrix, create, 'body:quantity', 'int32-overflow').send.value, 2147483648);
  assert.equal(find(matrix, create, 'body:price', 'at-exclusive-maximum').send.value, 1000);
  assert.equal(find(matrix, create, 'body:price', 'below-exclusive-maximum').send.value, 999.99);
  assert.deepEqual(find(matrix, create, 'body:labels', 'below-min-items').send.value, []);
  assert.deepEqual(find(matrix, create, 'body:labels', 'above-max-items').send.value, [
    'new',
    'new',
    'new',
    'new',
  ]);
  assert.deepEqual(find(matrix, create, 'body:labels', 'duplicate-items').send.value, [
    'new',
    'new',
  ]);
  assert.equal(find(matrix, create, 'body:labels[]', 'enum-outside').class, 'scheduled');
  const unknown = find(matrix, create, 'body:$', 'unknown-property');
  assert.equal(unknown.class, 'scheduled', 'additionalProperties false');
  assert.equal(unknown.expect.outcome, 'reject');
  assert.equal(find(matrix, 'GET /items', 'query:page', 'missing-required').send.omit, true);
  assert.equal(
    find(matrix, 'GET /items', 'header:X-Locale', 'above-max-length').send.value.length,
    6,
  );
  assert.equal(find(matrix, 'GET /items/{sku}', 'path:sku', 'pattern-mismatch').send.value, '!');
});

test('enum-like optional query parameters are combined pairwise', async () => {
  const matrix = deriveProbeMatrix(await catalog());
  const combos = matrix.probes.filter((p) => p.kind === 'pairwise-combination');
  assert.ok(combos.length > 0 && combos.length < 36, `${combos.length} rows of 36`);
  assert.ok(combos.every((p) => p.technique === 'pairwise' && p.expect.outcome === 'accept'));
  const level = (entry) => (entry.omit ? '(omitted)' : entry.value);
  const factors = [
    { name: 'sort', values: ['asc', 'desc', '(omitted)'] },
    { name: 'kind', values: ['book', 'film', 'game', '(omitted)'] },
    { name: 'archived', values: [true, false, '(omitted)'] },
  ];
  const rows = combos.map((p) => Object.fromEntries(p.send.set.map((e) => [e.name, level(e)])));
  assert.deepEqual(missingPairs(factors, rows), []);
});

test('coverage comes from probe:<id> references in spec files', async () => {
  const specs = join(FIXTURES, 'derive-probe-matrix', 'specs');
  const references = findProbeReferences(specs, join(FIXTURES, 'derive-probe-matrix'));
  assert.deepEqual([...references.keys()].sort(), ['p-76b78a6d7e', 'p-8a9ccac9cc']);
  assert.deepEqual(references.get('p-76b78a6d7e'), ['specs/animals.spec.ts']);

  const matrix = deriveProbeMatrix(await shelter('shelter-3.0.json'), { references });
  const over = find(matrix, 'POST /animals', 'body:name', 'above-max-length');
  assert.equal(over.id, 'p-76b78a6d7e');
  assert.equal(over.covered, true);
  assert.deepEqual(over.coveredBy, ['specs/animals.spec.ts']);
  assert.equal(
    find(matrix, 'GET /animals/{animalId}', 'path:animalId', 'at-minimum').covered,
    true,
  );
  assert.equal(matrix.totals.scheduled.covered, 2);
  assert.equal(find(matrix, 'POST /animals', 'body:name', 'below-min-length').covered, false);
});

test('the written matrix is deterministic and needs no reformatting', async () => {
  const model = await catalog();
  const text = formatJson(deriveProbeMatrix(model));
  assert.equal(text, formatJson(deriveProbeMatrix(await catalog())));
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(deriveProbeMatrix(model))));
  const prettier = await import('prettier');
  const options = { ...(await prettier.resolveConfig(join(FIXTURES, 'x.json'))), parser: 'json' };
  assert.equal(await prettier.format(text, options), text);
});

test('formatJson lays out empty objects and arrays inside arrays as the formatter does', async () => {
  // A probe value of `[{}, {}]` (an array of empty objects) was written open and failed the
  // format check of the Keycloak pack's matrix.
  const prettier = await import('prettier');
  const options = { ...(await prettier.resolveConfig(join(FIXTURES, 'x.json'))), parser: 'json' };
  const values = [
    { value: [{}, {}] },
    { value: [[], []] },
    { value: [{}, 1, 'a', null] },
    { value: [{ a: 1 }, {}] },
    { value: Array.from({ length: 40 }, () => ({})) },
  ];
  for (const value of values) {
    const text = formatJson(value);
    assert.equal(await prettier.format(text, options), text, JSON.stringify(value));
  }
});
