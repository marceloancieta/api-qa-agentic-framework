// Floor derivation (CON-08): the formula's terms, their sum and cross-version equivalence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadModel } from '../lib/openapi.mjs';
import { countLimits, deriveFloor, MINIMUM, renderTable, TERMS } from '../derive-floor.mjs';

const OPENAPI = join(import.meta.dirname, '..', '__fixtures__', 'openapi');
const OWN = join(import.meta.dirname, '..', '__fixtures__', 'derive-floor');
const floorOf = async (file) => deriveFloor(await loadModel(file));
const byKey = (result) => Object.fromEntries(result.operations.map((op) => [op['key'], op]));

test('shelter in Swagger 2.0, OpenAPI 3.0 and 3.1 yields the same floor', async () => {
  const [v2, v30, v31] = await Promise.all(
    ['shelter-2.0.json', 'shelter-3.0.json', 'shelter-3.1.yaml'].map((name) =>
      floorOf(join(OPENAPI, name)),
    ),
  );
  assert.deepEqual(v30, v2);
  assert.deepEqual(v31, v2);
  const ops = byKey(v2);
  assert.deepEqual(ops['POST /animals'].terms, {
    positive: 1,
    required: 1,
    constraints: 4,
    valueSets: 1,
    pathParams: 0,
    errors: 1,
    body: 1,
    security: 2,
  });
  assert.equal(ops['GET /animals/{animalId}'].floor, 4);
  assert.equal(v2.total, 15);
});

test('every term of the formula is computed as documented', async () => {
  const ops = byKey(await floorOf(join(OWN, 'terms.json')));
  assert.deepEqual(ops['POST /accounts/{accountId}/notes'].terms, {
    positive: 1,
    required: 3, // text and level (id is readOnly) plus the X-Trace header
    constraints: 8, // text 3, score 3, accountId 1, tags maxItems 1; level's pattern is a set
    valueSets: 3, // level (literal pattern), kind (referenced enum), tags items
    pathParams: 1,
    errors: 2, // 400 and 4XX; 401/403 belong to security, default adds nothing
    body: 1,
    security: 2,
  });
  assert.deepEqual(ops['PUT /notes/batch'].terms, {
    positive: 1,
    required: 2, // an array body is judged by its records
    constraints: 6,
    valueSets: 2,
    pathParams: 0,
    errors: 1, // anonymous access is allowed, so 401 is an ordinary declared error
    body: 0,
    security: 0,
  });
  assert.equal(ops['GET /health'].sum, 1);
  assert.equal(ops['GET /health'].floor, MINIMUM, 'the minimum applies');
});

test('terms add up to the sum and the floor never drops below the minimum', async () => {
  for (const file of [join(OWN, 'terms.json'), join(OPENAPI, 'petstore-v3.json')]) {
    const result = await floorOf(file);
    for (const op of result.operations) {
      assert.equal(
        op.sum,
        TERMS.reduce((total, term) => total + op.terms[term], 0),
        op.key,
      );
      assert.equal(op.floor, Math.max(MINIMUM, op.sum), op.key);
    }
    assert.equal(
      result.total,
      result.operations.reduce((total, op) => total + op.floor, 0),
    );
  }
});

test('one limit per bound, whatever keyword expresses it', () => {
  assert.equal(countLimits({ minimum: 1, exclusiveMinimum: 1 }), 1);
  assert.equal(countLimits({ minLength: 1, maxLength: 2, pattern: '^a+$' }), 3);
  assert.equal(countLimits({ pattern: '^(a|b)$' }), 0);
  assert.equal(countLimits(true), 0);
});

test('the table shows every term per operation and the total', async () => {
  const text = renderTable(await floorOf(join(OPENAPI, 'shelter-3.0.json')));
  const lines = text.split('\n');
  assert.match(
    lines[0],
    /^operation\s+pos\s+req\s+lim\s+set\s+path\s+err\s+body\s+sec\s+sum\s+floor$/,
  );
  assert.match(text, /^POST \/animals\s+1\s+1\s+4\s+1\s+0\s+1\s+1\s+2\s+11\s+11$/m);
  assert.match(text, /^total\s+15$/m);
});
