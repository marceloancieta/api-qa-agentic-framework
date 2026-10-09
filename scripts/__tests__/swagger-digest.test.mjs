// Contract digest tests (CON-03): cross-version equality, drift classes and stable output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocument, loadModel, normalize } from '../lib/openapi.mjs';
import {
  computeDigest,
  diffDigests,
  formatDiff,
  serializeDigest,
  sortKeys,
} from '../swagger-digest.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'swagger-digest.mjs');
const OPENAPI = join(import.meta.dirname, '..', '__fixtures__', 'openapi');
const OWN = join(import.meta.dirname, '..', '__fixtures__', 'swagger-digest');

const shelter = () => loadDocument(join(OPENAPI, 'shelter-3.0.json'));
const digestOf = (doc) => computeDigest(normalize(doc));

/** Digest of the 3.0 shelter before and after `mutate` edits a copy of the raw document. */
async function drift(mutate) {
  const doc = await shelter();
  const before = digestOf(doc);
  const changed = structuredClone(doc);
  mutate(changed);
  return diffDigests(before, digestOf(changed));
}

const summary = (entries) => entries.map((entry) => [entry.class, entry.change, entry.where]);
const runCli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 descriptions of one API share one digest', async () => {
  const digests = await Promise.all(
    ['shelter-2.0.json', 'shelter-3.0.json', 'shelter-3.1.yaml'].map(async (name) =>
      serializeDigest(computeDigest(await loadModel(join(OPENAPI, name)))),
    ),
  );
  assert.equal(digests[1], digests[0]);
  assert.equal(digests[2], digests[0]);
});

test('the digest fingerprints parameters, bodies through references, responses and schemas', async () => {
  const digest = digestOf(await shelter());
  const read = digest.operations['GET /animals/{animalId}'];
  assert.equal(read.parameters['path:animalId'], 'integer required format="int64" minimum=1');
  assert.equal(read.parameters['query:verbose'], 'boolean default=false');
  assert.deepEqual(Object.keys(read.responses), ['200', '404']);
  assert.equal(read.security, 'none');

  const create = digest.operations['POST /animals'];
  assert.equal(create.requestBody.$, 'ref=Animal object required');
  assert.equal(
    create.requestBody['$.name'],
    'string required pattern="^[A-Za-z ]+$" minLength=1 maxLength=50',
  );
  assert.equal(create.requestBody['$.tags[].label'], 'string', 'body expanded through $ref');
  assert.equal(create.responses['400'].$, 'ref=Error', 'responses name the schema');
  assert.equal(digest.schemas.Animal['$.tags[]'], 'ref=Tag', 'named schemas do not inline others');
  assert.equal(digest.schemas.Error['$.code'], 'integer required format="int32"');
  assert.match(digest.descriptions['POST /animals'], /^[0-9a-f]{16}$/);
});

test('a recursive schema is cut at the cycle instead of looping', async () => {
  const digest = computeDigest(await loadModel(join(OWN, 'recursive.json')));
  const body = digest.operations['POST /nodes'].requestBody;
  assert.equal(body['$.children[]'], 'ref=Node cycle');
  assert.equal(body['$.parent'], 'ref=Node cycle');
  assert.equal(body['$.meta{*}'], 'string maxLength=20');
  assert.equal(body['$.value<oneOf 1>'], 'integer');
});

test('a tightened constraint is parameter or schema drift, depending on where it lives', async () => {
  const parameter = await drift((doc) => {
    doc.components.parameters.AnimalId.schema.minimum = 10;
  });
  assert.deepEqual(summary(parameter.structural), [
    ['parameters', 'changed', 'GET /animals/{animalId} path:animalId'],
  ]);
  assert.equal(parameter.structural[0].after, 'integer required format="int64" minimum=10');

  const property = await drift((doc) => {
    doc.components.schemas.Animal.properties.name.maxLength = 40;
  });
  assert.deepEqual(summary(property.structural), [
    ['requestBody', 'changed', 'POST /animals $.name'],
    ['schemas', 'changed', 'Animal $.name'],
  ]);
  assert.deepEqual(property.descriptions, []);
});

test('a removed response code is response-code drift', async () => {
  const diff = await drift((doc) => {
    delete doc.paths['/animals/{animalId}'].get.responses['404'];
  });
  assert.deepEqual(summary(diff.structural), [
    ['responseCodes', 'removed', 'GET /animals/{animalId} 404'],
  ]);
});

test('an added required parameter is parameter drift', async () => {
  const diff = await drift((doc) => {
    doc.paths['/animals'].post.parameters = [
      { name: 'X-Request-Id', in: 'header', required: true, schema: { type: 'string' } },
    ];
  });
  assert.deepEqual(summary(diff.structural), [
    ['parameters', 'added', 'POST /animals header:X-Request-Id'],
  ]);
  assert.equal(diff.structural[0].after, 'string required');
});

test('added and removed operations and schemas, and changed security, are structural', async () => {
  const diff = await drift((doc) => {
    doc.paths['/animals/{animalId}'].delete = { responses: { 204: { description: 'Gone' } } };
    delete doc.paths['/animals'].post;
    doc.components.schemas.Extra = { type: 'string' };
    doc.paths['/animals/{animalId}'].get.security = [{ apiKey: [] }];
  });
  assert.deepEqual(summary(diff.structural), [
    ['operations', 'added', 'DELETE /animals/{animalId}'],
    ['operations', 'removed', 'POST /animals'],
    ['security', 'changed', 'GET /animals/{animalId}'],
    ['schemas', 'added', 'Extra'],
  ]);
});

test('a description-only change is low-severity drift that does not fail the check', async () => {
  const diff = await drift((doc) => {
    doc.paths['/animals'].post.description = 'Registration now also reserves a kennel.';
    doc.paths['/animals/{animalId}'].get.summary = 'Read   an\n animal'; // whitespace only
  });
  assert.deepEqual(diff.structural, []);
  assert.deepEqual(summary(diff.descriptions), [['descriptions', 'changed', 'POST /animals']]);
  const report = formatDiff(diff);
  assert.match(report, /^Operation text \(low severity, does not fail the check\) \(1\):/);
});

test('the report groups entries by class', async () => {
  const diff = await drift((doc) => {
    delete doc.paths['/animals/{animalId}'].get.responses['404'];
    doc.components.schemas.Tag.properties.label.minLength = 2;
    doc.paths['/animals'].post.summary = 'Register a new animal';
  });
  assert.equal(
    formatDiff(diff),
    [
      'Request bodies (1):',
      '  ~ POST /animals $.tags[].label: string -> string minLength=2',
      'Response codes (1):',
      '  - GET /animals/{animalId} 404',
      'Named schemas (1):',
      '  ~ Tag $.label: string -> string minLength=2',
      'Operation text (low severity, does not fail the check) (1):',
      `  ~ POST /animals: ${diff.descriptions[0].before} -> ${diff.descriptions[0].after}`,
    ].join('\n'),
  );
  assert.equal(formatDiff({ structural: [], descriptions: [] }), 'No drift.');
});

test('the serialized digest is stable regardless of key order in the source', async () => {
  const doc = await shelter();
  const reordered = JSON.parse(JSON.stringify(doc, (_key, value) => reverseKeys(value)));
  const first = serializeDigest(digestOf(doc));
  assert.equal(serializeDigest(digestOf(doc)), first);
  assert.equal(serializeDigest(digestOf(reordered)), first);
  assert.deepEqual(Object.keys(sortKeys({ b: 1, a: { d: 1, c: 2 } }).a), ['c', 'd']);
});

function reverseKeys(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).reverse());
}

test('the tracked Petstore digest matches the pack spec (CON-09)', () => {
  const result = runCli('--service', 'petstore', '--check');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /matches docs\/discovery\/petstore-digest\.json structurally/);
});

test('--check exits 1 with a grouped report when the spec drifted, 0 on text drift only', () => {
  const spec = JSON.parse(readFileSync(join(ROOT, 'services', 'petstore', 'openapi.json'), 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'digest-'));

  const textOnly = structuredClone(spec);
  textOnly.paths['/pet'].put.description = 'Replace an existing pet, reworded.';
  writeFileSync(join(dir, 'text.json'), JSON.stringify(textOnly));
  const quiet = runCli('--service', 'petstore', '--spec', join(dir, 'text.json'), '--check');
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.match(quiet.stdout, /Operation text .*\n {2}~ PUT \/pet:/);

  const broken = structuredClone(spec);
  delete broken.paths['/pet'].put.responses['404'];
  writeFileSync(join(dir, 'broken.json'), JSON.stringify(broken));
  const loud = runCli('--service', 'petstore', '--spec', join(dir, 'broken.json'), '--check');
  assert.equal(loud.status, 1);
  assert.match(loud.stderr, /Response codes \(1\):\n {2}- PUT \/pet 404/);
});

test('--write and --check together are refused', () => {
  const result = runCli('--service', 'petstore', '--write', '--check');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only one of --write and --check/);
});
