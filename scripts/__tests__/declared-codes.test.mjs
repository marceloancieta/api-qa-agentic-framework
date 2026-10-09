// Declared against received response codes (CON-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModel, normalize } from '../lib/openapi.mjs';
import {
  basePaths,
  compareCodes,
  compileTemplates,
  coverage,
  groupRuns,
  matchOperation,
  readExchanges,
  renderReport,
  stripBase,
  unreachedCodes,
} from '../declared-codes.mjs';

const OWN = join(import.meta.dirname, '..', '__fixtures__', 'declared-codes');
const RESULTS = join(OWN, 'results');
const byKey = (report) => Object.fromEntries(report.operations.map((op) => [op['key'], op]));

const petstoreLike = normalize({
  openapi: '3.0.3',
  paths: Object.fromEntries(
    ['/pet/{petId}', '/pet/findByStatus', '/{kind}/findByStatus', '/files/{name}.json'].map(
      (path) => [path, { get: { responses: { 200: { description: 'ok' } } } }],
    ),
  ),
});
const templates = compileTemplates(petstoreLike.operations);
const match = (path, method = 'GET', bases = []) =>
  matchOperation(templates, method, path, bases).operation?.path ?? null;

test('server base paths are stripped, longest first', () => {
  const bases = basePaths(['https://host.test/api/v3/', '/api', 'http://other.test']);
  assert.deepEqual(bases, ['/api/v3', '/api']);
  assert.equal(stripBase('/api/v3/pet/1', bases), '/pet/1');
  assert.equal(stripBase('/api/pet/1', bases), '/pet/1');
  assert.equal(stripBase('/apiv3/pet', bases), '/apiv3/pet', 'only whole segments');
  assert.equal(match('/api/v3/pet/12', 'GET', bases), '/pet/{petId}');
});

test('the most specific template wins', () => {
  assert.equal(match('/pet/findByStatus'), '/pet/findByStatus');
  assert.equal(match('/pet/findByOwner'), '/pet/{petId}');
  assert.equal(match('/store/findByStatus'), '/{kind}/findByStatus');
  assert.equal(match('/files/report.json'), '/files/{name}.json', 'mixed segment');
  assert.equal(match('/pet/anon%3A1f2e3d'), '/pet/{petId}', 'a pseudonymized identity');
  assert.equal(match('/pet/find%42yStatus'), '/pet/findByStatus', 'literals compare decoded');
  assert.deepEqual(matchOperation(templates, 'PUT', '/pet/1'), {
    operation: null,
    reason: 'method',
  });
  assert.deepEqual(matchOperation(templates, 'GET', '/pet/1/photos'), {
    operation: null,
    reason: 'path',
  });
});

test('explicit codes, ranges and default cover received codes differently', () => {
  const declared = ['200', '404', '4XX', 'default'];
  assert.equal(coverage(declared, 404), 'explicit');
  assert.equal(coverage(declared, 422), 'range');
  assert.equal(coverage(declared, 500), 'default');
  assert.equal(coverage(['200'], 500), null);
  assert.deepEqual(
    unreachedCodes(declared, [200, 404]),
    ['4XX'],
    'an explicit code is not the range',
  );
  assert.deepEqual(unreachedCodes(declared, [200, 409]), ['404']);
  assert.deepEqual(unreachedCodes(['default'], []), [], 'default is never unreached');
});

test('runs are split at idle gaps', () => {
  const minute = 60_000;
  const runs = groupRuns([
    { start: 30 * minute, stop: 31 * minute },
    { start: 0, stop: 2 * minute },
    { start: 5 * minute, stop: 6 * minute },
  ]);
  assert.deepEqual(
    runs.map((run) => run.map((result) => result.start / minute)),
    [[0, 5], [30]],
  );
});

test('evidence of the latest run is read through the result files', () => {
  const latest = readExchanges(RESULTS);
  assert.equal(latest.runs, 2);
  assert.equal(latest.tests, 2);
  assert.equal(latest.exchanges.length, 7, 'non-exchange attachments are ignored');
  assert.ok(latest.exchanges.some((e) => e.test === 'pets.spec.ts > finds pets by status'));
  assert.equal(readExchanges(RESULTS, { all: true }).exchanges.length, 8);

  const loose = mkdtempSync(join(tmpdir(), 'codes-'));
  writeFileSync(
    join(loose, 'a.json'),
    JSON.stringify({ request: { method: 'GET', url: 'http://h/x' }, response: { status: 200 } }),
  );
  writeFileSync(join(loose, 'b.json'), JSON.stringify({ label: 'not evidence' }));
  assert.equal(readExchanges(loose).exchanges.length, 1, 'loose attachments without results');
});

test('declared and received codes are compared in both directions', async () => {
  const model = await loadModel(join(OWN, 'api.json'));
  const report = compareCodes(model, readExchanges(RESULTS).exchanges);
  const ops = byKey(report);

  assert.deepEqual(ops['GET /pet/{petId}'].observed, { 404: 1 });
  assert.deepEqual(ops['GET /pet/{petId}'].unreached, ['200', '400']);
  assert.deepEqual(
    ops['GET /pet/{petId}'].undeclared.map((u) => [u.status, u.default]),
    [[404, false]],
  );
  assert.equal(
    ops['GET /pet/{petId}'].undeclared[0].samples[0].test,
    'pets.spec.ts > reads a missing pet',
  );

  assert.deepEqual(ops['GET /pet/findByStatus'].observed, { 200: 1, 500: 1 });
  assert.deepEqual(ops['GET /pet/findByStatus'].unreached, ['400']);
  assert.deepEqual(
    ops['GET /pet/findByStatus'].undeclared.map((u) => [u.status, u.default]),
    [[500, true]],
  );

  assert.deepEqual(ops['POST /pet'].undeclared, [], '422 is inside the declared 4XX');
  assert.deepEqual(ops['POST /pet'].unreached, ['200']);
  assert.deepEqual(ops['GET /files/{name}.json'].unreached, []);
  assert.deepEqual(ops['GET /store/inventory'].observed, {});

  assert.deepEqual(
    report.unmatched.map((u) => [u.method, u.path, u.reason]),
    [
      ['GET', '/api/v3/unknown', 'path'],
      ['PATCH', '/api/v3/pet/7', 'method'],
    ],
  );
  assert.deepEqual(report.summary, {
    exchanges: 7,
    operations: 6,
    exercised: 4,
    unreached: 7,
    undeclared: 2,
    unmatched: 2,
  });

  const lenient = compareCodes(model, readExchanges(RESULTS).exchanges, { defaultDeclares: true });
  assert.equal(lenient.summary.undeclared, 1, 'default may be accepted as a declaration');

  const text = renderReport(report);
  assert.match(
    text,
    /^GET \/pet\/findByStatus\s+200 400 default\s+200 500\s+400\s+500\(default\)$/m,
  );
  assert.match(
    text,
    /GET \/pet\/\{petId\} -> 404 x1\n\s+http:\/\/localhost:8080\/api\/v3\/pet\/anon%3A1f2e3d/,
  );
});
